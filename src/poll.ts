import { PrismaClient } from "@prisma/client";
import {
  Block,
  BlockAction,
  ButtonAction,
  KnownBlock,
  Logger,
  OverflowAction,
} from "@slack/bolt";
import { WebClient } from "@slack/web-api";
import { list_non_answered, remind_in_dm } from "./reactions";
import { meeting_blocks } from "./meetings/message";
import { vote_blocks } from "./vote/message";
import { open_remove_options_modal } from "./vote/modal";

let prisma = new PrismaClient();

export enum PollType {
  Vote = "vote",
  Meeting = "meeting",
}

interface PollOption {
  time: Date | null;
  name: string | null;
}

export interface PollArgs {
  channel: string;
  user_id: string;
  title: string;
  type: PollType;
  options: PollOption[];
  usersCanAddOption?: boolean;
  displayVotes?: boolean;
  addOptionDesc?: string | null;
  description?: string | null;
}

export async function create_poll(client: WebClient, args: PollArgs) {
  let created = await prisma.poll.create({
    data: {
      author: args.user_id,
      channel: args.channel,
      type: args.type,
      description: args.description || "",
      title: args.title,
      addOptionDesc: args.addOptionDesc,
      ts: "",
      options: {
        create: args.options,
      },
      usersCanAddOption: args.usersCanAddOption || false,
      displayUsersVotes: args.displayVotes
    },
  });

  let blocks = await poll_blocks(created.id);

  let res = await client.chat.postMessage({
    text: `Vote in poll: ${created.title}`,
    channel: args.channel,
    blocks: blocks,
  });

  await client.reactions.add({
    channel: res.channel,
    timestamp: res.ts,
    name: "no_entry_sign",
  });

  return await prisma.poll.update({
    where: {
      id: created.id,
    },
    data: {
      ts: res.ts,
      channel: res.channel,
    },
  });
}

export async function handle_vote(
  client: WebClient,
  body: BlockAction<ButtonAction>,
  action: ButtonAction,
  logger: Logger
) {
  let poll = await prisma.poll.findFirstOrThrow({
    where: { ts: body.message?.ts, channel: body.channel?.id },
  });

  action.value = action.value || "0";
  let option = await prisma.option.findFirstOrThrow({
    where: { id: parseInt(action.value) },
  });
  let user = body.user;
  user.name = user.name || "No name";

  let vote = await prisma.vote.findFirst({
    where: { user: user.id, optionId: option.id },
  });

  if (vote) {
    await prisma.vote.delete({ where: { id: vote.id } });
  } else {
    await prisma.vote.create({
      data: {
        user: user.id,
        userName: user.name,
        optionId: option.id,
        pollId: poll.id,
      },
    });
  }

  let blocks = await poll_blocks(poll.id);
  client.chat.update({
    text: `Vote in poll: ${poll.title}`,
    channel: poll.channel,
    ts: poll.ts,
    blocks: blocks,
  });
  logger.info(`User ${user.id} voted in poll ${poll.id}`);
}

export async function handle_overflow(
  client: WebClient,
  body: BlockAction<OverflowAction>,
  action: OverflowAction,
  logger: Logger
) {
  let poll = await prisma.poll.findFirstOrThrow({
    where: { ts: body.message?.ts, channel: body.channel?.id },
  });

  const option = action.selected_option.value;

  if (option === "delete") {
    if (poll.author === body.user.id) {
      await prisma.poll.delete({
        where: {
          id: poll.id,
        },
        include: { options: true, votes: true },
      });

      await client.chat.delete({ channel: poll.channel, ts: poll.ts });
      logger.info(`User ${body.user.id} deleted poll ${poll.id}`);
    } else {
      client.chat.postEphemeral({
        channel: poll.channel,
        user: body.user.id,
        text: `You cannot delete other users's polls.`,
      });
      logger.info(`User ${body.user.id} tried to delete poll ${poll.id}`);
    }
  } else if (option === "remove-options") {
    if (poll.author === body.user.id) {
      await open_remove_options_modal(client, body, logger);
    } else {
      client.chat.postEphemeral({
        channel: poll.channel,
        user: body.user.id,
        text: `You cannot remove options form other users's polls.`,
      });
      logger.info(`User ${body.user.id} tried to remove options for poll ${poll.id}`);

    }
  }
  
  
  else if (option === "remind-dm") {
    let ts = body.message?.ts;
    await remind_in_dm(client, body.channel?.id!, body.user.id, ts!, logger);
    logger.info(`User ${body.user.id} reminded in DM for poll ${poll.id}`);
  } else if (option === "list-non-responded") {
    let ts = body.message?.ts;
    await list_non_answered(client, body.channel?.id!, body.user.id, ts!);
    logger.info(
      `User ${body.user.id} listed non-responded for poll ${poll.id}`
    );
  } else if (option === "refresh") {
    let blocks = await poll_blocks(poll.id);
    client.chat.update({
      text: `Vote in poll: ${poll.title}`,
      channel: poll.channel,
      ts: poll.ts,
      blocks: blocks,
    });
    logger.info(`User ${body.user.id} refreshed poll ${poll.id}`);
  }
}

export const list_votes_for_user = async (
  client: WebClient,
  body: BlockAction<ButtonAction>,
  logger: Logger
) => {
  let votes = await prisma.vote.findMany({
    where: {
      poll: {
        ts: body.message?.ts,
      },
      user: body.user.id,
      option: {
        isNot: undefined,
      },
    },
    include: { option: true },
  });

  if (votes.length === 0) {
    await client.chat.postEphemeral({
      channel: body.channel?.id!,
      user: body.user.id,
      text: `You have not voted in this poll`,
    });
    return;
  }

  let text = `You have voted for:\n`;

  for (let vote of votes) {
    text += `${vote.option.name}\n`;
  }

  await client.chat.postEphemeral({
    channel: body.channel?.id!,
    user: body.user.id,
    text: text
  });

  logger.info(`User ${body.user.id} listed own votes for poll ${body.channel?.id!}`);
}

export const poll_blocks = async (
  pollId: number
): Promise<(Block | KnownBlock)[]> => {
  let poll = await prisma.poll.findFirstOrThrow({
    where: { id: pollId },
    include: { options: { include: { votes: true } } },
  });

  switch (poll.type) {
    case PollType.Meeting:
      return meeting_blocks(poll);
    case PollType.Vote:
      return vote_blocks(poll);
  }

  return [];
};
