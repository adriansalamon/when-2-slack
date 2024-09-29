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
}

export async function create_poll(client: WebClient, args: PollArgs) {
  let created = await prisma.poll.create({
    data: {
      author: args.user_id,
      channel: args.channel,
      type: args.type,
      description: "",
      title: args.title,
      ts: "",
      options: {
        create: args.options,
      },
      usersCanAddOption: args.usersCanAddOption || false,
    },
  });

  let blocks = await poll_blocks(created.id);

  let res = await client.chat.postMessage({
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
  action: ButtonAction
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
  client.chat.update({ channel: poll.channel, ts: poll.ts, blocks: blocks });
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
    } else {
      client.chat.postEphemeral({
        channel: poll.channel,
        user: body.user.id,
        text: `You cannot delete other users's polls.`,
      });
    }
  } else if (option === "remind-dm") {
    let ts = body.message?.ts;
    await remind_in_dm(client, body.channel?.id!, body.user.id, ts!, logger);
  } else if (option === "list-non-responded") {
    let ts = body.message?.ts;
    await list_non_answered(client, body.channel?.id!, body.user.id, ts!);
  } else if (option === "refresh") {
    let blocks = await poll_blocks(poll.id);
    client.chat.update({ channel: poll.channel, ts: poll.ts, blocks: blocks });
  }
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
