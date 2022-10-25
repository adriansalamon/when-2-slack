import { PrismaClient } from "@prisma/client";
import {
  Block,
  BlockAction,
  ButtonAction,
  KnownBlock,
  OverflowAction,
} from "@slack/bolt";
import { WebClient } from "@slack/web-api";

let prisma = new PrismaClient();

export async function create_poll(
  client: WebClient,
  channel: string,
  user_id: string,
  options: { time: Date }[]
) {
  let created = await prisma.poll.create({
    data: {
      author: user_id,
      channel: channel,
      description: "",
      title: "",
      ts: "",
      options: {
        create: options,
      },
    },
  });

  let blocks = await poll_blocks(created.id);

  let res = await client.chat.postMessage({
    channel: channel,
    blocks: blocks,
  });

  await client.reactions.add({
    channel: res.channel,
    timestamp: res.ts,
    name: "no_entry_sign",
  });

  await prisma.poll.update({
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
  console.log(poll);

  let option = await prisma.option.findFirstOrThrow({
    where: { id: parseInt(action.value) },
  });
  let user = body.user;

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
  action: OverflowAction
) {
  let poll = await prisma.poll.findFirstOrThrow({
    where: { ts: body.message?.ts, channel: body.channel?.id },
  });

  if (action.selected_option.value === "delete") {
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
  }
}

const poll_blocks = async (pollId: number): Promise<(Block | KnownBlock)[]> => {
  let poll = await prisma.poll.findFirstOrThrow({
    where: { id: pollId },
    include: { options: { include: { votes: true } } },
  });

  let options = poll.options.flatMap((option) => {
    let names = option.votes.reduce(
      (acc, vote) => `${acc} @${vote.userName}`,
      ""
    );

    let time = option.time;
    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };

    let text = `:calendar: *${time.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "numeric",
    })}, ${time.toLocaleTimeString("sv-SE").slice(0, 5)}*`;

    if (option.votes.length > 0) {
      text += ` ${"`"}${option.votes.length}${"`"}\n${names}`;
    }

    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: text,
        },
        accessory: {
          type: "button",
          action_id: "vote_click",
          text: {
            type: "plain_text",
            emoji: true,
            text: "Vote",
          },
          value: `${option.id}`,
        },
      },
    ];
  });

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Fill in a date that fits you! *React* with :no_entry_sign: if no times work!",
      },
      accessory: {
        type: "overflow",
        action_id: "form_overflow",
        options: [
          { text: { type: "plain_text", text: "Delete" }, value: "delete" },
        ],
      },
    },
    { type: "divider" },
    ...options,
  ];
};
