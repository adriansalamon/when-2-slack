import { WebClient } from "@slack/web-api";
import { PrismaClient } from "@prisma/client";
import { AppMentionEvent, Logger, SlackViewAction } from "@slack/bolt";
import { Member } from "@slack/web-api/dist/response/UsersListResponse";

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

// Ensures that the bot is a member of the channel, otherwise send an ephemeral message to the invoker
export const ensure_channel_member = async (
  client: WebClient,
  body: SlackViewAction
) => {
  let private_metadata = JSON.parse(body.view.private_metadata);
  let channel = private_metadata.channel;

  let members = await channel_members(client, channel);

  let user = body.user.id;
  let bot_id = await client.auth.test().then((auth) => auth.user_id);

  if (bot_id && members.includes(bot_id)) {
    return true;
  } else {
    await client.chat.postMessage({
      channel: user,
      text: "You need to invite me to the channel before using this command!",
    });
    return false;
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

  let user_map = await list_all_users(client);

  return user_map.members?.filter(
    (member) => !member.is_bot && not_reacted.has(member.id!)
  )!;
};

// Returns an array of members
const channel_members = async (
  client: WebClient,
  channel: string
): Promise<string[]> => {
  try {
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
  } catch (error) {
    return [];
  }
};

// Returns a map of all users in the slack workspace
const list_all_users = async (client: WebClient) => {
  let users = await client.users.list();
  let cursor = users.response_metadata?.next_cursor;
  while (cursor) {
    let response = await client.users.list({ cursor: cursor });
    users.members?.push(...response.members!);
    cursor = response.response_metadata?.next_cursor;
  }

  return users;
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

export const handle_mention = async (
  client: WebClient,
  event: AppMentionEvent,
  logger: Logger
) => {
  const channel = event.channel;
  const invoker = event.user;
  const text = event.text.toLowerCase();
  const thread = event.thread_ts;

  logger.info(
    `User ${invoker} mentioned the bot in channel ${channel}, thread ${thread}`
  );

  if (!thread) {
    await client.chat.postEphemeral({
      channel: channel,
      user: invoker!,
      text: "You have to use me in a thread",
    });
    return;
  }

  if (text.includes("list")) {
    let wanted_reactions = text.match(/(?<=:)[^:]+(?=:)/g);
    let no_react_users = await get_no_react_ids_for_reactions(
      client,
      channel,
      thread,
      wanted_reactions!
    );

    if (no_react_users.length === 0) {
      await client.chat.postEphemeral({
        channel: channel,
        user: invoker!,
        text: "All users have reacted!",
        thread_ts: thread,
      });

      logger.info(
        `User ${invoker} listed ${no_react_users.length} users not having reacted in channel ${channel}`
      );

      return;
    }

    let no_react_names = no_react_users.map((user) => user.real_name);
    let formatted_emojis = wanted_reactions
      ?.map((emoji) => `:${emoji}:`)
      .join("");
    let usernames = no_react_names.join(", ");
    let message = `It seems like these people have not yet reacted with ${formatted_emojis}: ${usernames}`;

    await client.chat.postEphemeral({
      channel: channel,
      user: invoker!,
      text: message,
      thread_ts: thread,
    });

    logger.info(
      `User ${invoker} listed ${no_react_users.length} users not having reacted in channel ${channel}`
    );

    return;
  }

  if (text.includes("remind")) {
    let wanted_reactions = text.match(/(?<=:)[^:]+(?=:)/g);
    let location = "here";
    if (text.includes("dm")) {
      location = "dm";
    }
    let no_react_users = await get_no_react_ids_for_reactions(
      client,
      channel,
      thread,
      wanted_reactions!
    );

    if (location === "here") {
      if (no_react_users.length === 0) {
        await client.chat.postEphemeral({
          channel: channel,
          user: invoker!,
          text: "All users have reacted!",
          thread_ts: thread,
        });

        logger.info(
          `User ${invoker} reminded ${no_react_users.length} users not having reacted in channel ${channel}`
        );

        return;
      }

      let pings = no_react_users.map((user) => `<@${user.id}>`).join(" ");
      let text = `Don't forget! :point_up: ${pings}`;
      await client.chat.postMessage({
        channel: channel,
        text: text,
        thread_ts: thread,
      });

      logger.info(
        `User ${invoker} reminded ${no_react_users.length} users not having reacted in channel ${channel}`
      );

      return;
    }

    if (location === "dm") {
      if (no_react_users.length === 0) {
        await client.chat.postEphemeral({
          channel: channel,
          user: invoker!,
          text: "All users have reacted!",
          thread_ts: thread,
        });

        logger.info(
          `User ${invoker} reminded ${no_react_users.length} in dms users not having reacted in channel ${channel}`
        );

        return;
      }

      let message_link = await client.chat
        .getPermalink({ channel: channel, message_ts: thread })
        .then((link) => link.permalink!);

      let pinged = await Promise.all(
        no_react_users.map(async (member) => {
          await client.chat.postMessage({
            channel: member.id!,
            text: `Dont forget to react to this <${message_link}|message>`,
          });
          return member.real_name!;
        })
      );

      let pinged_text = pinged.join(", ");

      await client.chat.postEphemeral({
        channel: channel,
        user: invoker!,
        text: `I just pinged these users:\n${pinged_text}`,
        thread_ts: thread,
      });

      logger.info(
        `User ${invoker} pinged ${no_react_users.length} users in dms not having reacted in channel ${channel}`
      );

      return;
    }
  }

  let bot_name = await client.auth.test().then((auth) => auth.user);

  await client.chat.postEphemeral({
    channel: channel,
    user: invoker!,
    text: `I didn't understand that, please use \`@${bot_name} :emoji: list\`, \`@${bot_name} :emoji: remind here\` or \`@${bot_name} :emoji: remind dm\``,
    thread_ts: thread,
  });

  logger.error(
    `User ${invoker} invoked the bot with an invalid command: ${text}`
  );
};

let get_no_react_ids_for_reactions = async (
  client: WebClient,
  channel: string,
  ts: string,
  wanted_reactions: string[]
): Promise<Member[]> => {
  let resp = await client.reactions.get({
    channel: channel,
    timestamp: ts,
    full: true,
  });

  let reactions = resp.message?.reactions || [];

  let reacted_users = new Set();
  for (let react of reactions) {
    if (wanted_reactions.includes(react.name!)) {
      react.users?.forEach((user) => {
        reacted_users.add(user);
      });
    }
  }

  let all_members = await channel_members(client, channel);

  let not_reacted = new Set(
    all_members?.filter((member) => !reacted_users.has(member))
  );

  let user_map = await list_all_users(client);

  return user_map.members?.filter(
    (member) => !member.is_bot && not_reacted.has(member.id!)
  )!;
};
