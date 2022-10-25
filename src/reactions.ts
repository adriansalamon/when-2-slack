import { WebClient } from "@slack/web-api";
import { PrismaClient } from "@prisma/client";
import { Logger } from "@slack/bolt";

let prisma = new PrismaClient();

export const remind_in_dm = async (
  client: WebClient,
  channel: string,
  user: string,
  thread_ts: string,
  logger: Logger
) => {
  logger.info(`User ${user} invokted remind_in_dms in channel ${channel}`);
  let no_react_ids = await get_no_react_ids(client, channel, thread_ts);

  if (no_react_ids?.length === 0) {
    // All users have reacted
    await client.chat.postEphemeral({
      channel: channel,
      user: user,
      text: "Looks like all users have responded!",
    });
  } else {
    let message_link = await client.chat
      .getPermalink({ channel: channel, message_ts: thread_ts })
      .then((link) => link.permalink!);

    let pinged = await Promise.all(
      no_react_ids.map(async (member) => {
        await client.chat.postMessage({
          channel: member.id!,
          text: `Dont forget to answer this <${message_link}|form>`,
        });
        return member.real_name!;
      })
    );

    let pinged_text = pinged.join(", ");

    await client.chat.postEphemeral({
      channel: channel,
      user: user,
      text: `I just pinged these users:\n${pinged_text}`,
    });
  }

  logger.info(
    `User ${user} reminded ${no_react_ids.length} users in channel ${channel}`
  );
};

// Sends an ephemeral message with users in channel that have now answered
export const list_non_answered = async (
  client: WebClient,
  channel: string,
  user: string,
  thread_ts: string
) => {
  let no_react_ids = await get_no_react_ids(client, channel, thread_ts);

  if (no_react_ids?.length === 0) {
    // All users have reacted
    await client.chat.postEphemeral({
      channel: channel,
      user: user,
      text: "Looks like all users have responded!",
    });
  } else {
    let non_answered_text = no_react_ids
      ?.map((member) => member.real_name)
      .join(", ");

    await client.chat.postEphemeral({
      channel: channel,
      user: user,
      text: `Looks like the following users have not responded:\n${non_answered_text}`,
    });
  }
};

// Returns a list of user ids that have not reacted
const get_no_react_ids = async (
  client: WebClient,
  channel: string,
  ts: string
) => {
  let users_reacted = await reacted_users(client, channel, ts);

  let all_members = await channel_members(client, channel);

  let not_reacted = new Set(
    all_members?.filter((member) => !users_reacted.has(member))
  );

  let user_map = await client.users.list();

  return user_map.members?.filter((member) => not_reacted.has(member.id!))!;
};

// Returns an array of members
const channel_members = async (
  client: WebClient,
  channel: string
): Promise<string[]> => {
  let member_response = await client.conversations.members({
    channel: channel,
  });
  let members = member_response.members;
  let cursor = member_response.response_metadata?.next_cursor;
  while (cursor) {
    member_response = await client.conversations.members({
      channel: channel,
      cursor: cursor,
    });
    members?.push(...member_response.members!);
    cursor = member_response.response_metadata?.next_cursor;
  }
  return members!;
};

// Returns a Set of users that have either reacted or voted
const reacted_users = async (
  client: WebClient,
  channel: string,
  ts: string
) => {
  let reactions = await client.reactions.get({
    channel: channel,
    timestamp: ts,
    full: true,
  });
  let votes = await prisma.vote.findMany({
    where: {
      poll: {
        ts: ts,
      },
    },
    select: {
      user: true,
    },
  });

  let users = new Set();

  reactions.message?.reactions?.forEach((react) => {
    if (react.name === "no_entry_sign") {
      react.users?.forEach((user) => {
        users.add(user);
      });
    }
  });

  votes.forEach((vote) => {
    users.add(vote.user);
  });

  return users;
};
