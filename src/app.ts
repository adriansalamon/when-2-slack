/* eslint-disable no-console */
/* eslint-disable import/no-internal-modules */
import "./utils/env";
import {
  App,
  Block,
  BlockAction,
  ButtonAction,
  KnownBlock,
  LogLevel,
  ModalView,
  OverflowAction,
  View,
} from "@slack/bolt";

import { ChatPostMessageArguments } from "@slack/web-api";
import { type } from "os";
import { Poll, Option, Vote, Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: LogLevel.DEBUG,
  port: Number(process.env.PORT) || 3000,
});

app.use(async ({ next }) => {
  await next();
});

app.command("/schedule", async ({ ack, body, client, logger }) => {
  // Acknowledge the command request
  await ack();
  let meetings = 1;

  try {
    // Call views.open with the built-in client
    const result = await client.views.open({
      // Pass a valid trigger_id within 3 seconds of receiving it
      trigger_id: body.trigger_id,
      view: {
        ...modal(meetings),
        private_metadata: JSON.stringify({
          meetings: meetings,
          channel: body.channel_id,
        }),
      },
    });
    logger.info(result);
  } catch (error) {
    logger.error(error);
  }
});

app.action<BlockAction>(
  { action_id: "add-alt" },
  async ({ ack, body, client, logger }) => {
    await ack();

    let private_metadata = JSON.parse(body.view?.private_metadata || "");
    private_metadata.meetings += 1;

    await client.views.update({
      view_id: body.view?.id,
      view: {
        ...modal(private_metadata.meetings),
        private_metadata: JSON.stringify(private_metadata),
      },
    });
  }
);

app.action<BlockAction>({ action_id: "select-date" }, async ({ ack }) => {
  await ack();
});

app.action<BlockAction>(
  { action_id: "select-time" },
  async ({ ack, action }) => {
    await ack();
  }
);

// Handle when a user votes
app.action<BlockAction<ButtonAction>>(
  "vote_click",
  async ({ ack, body, client, logger, action, say }) => {
    await ack();
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
);

// Handle when a user deletes a poll
app.action<BlockAction<OverflowAction>>(
  "form_overflow",
  async ({ ack, body, client, logger, action, say }) => {
    await ack();
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
);

app.view("schedule_view", async ({ ack, body, client, logger }) => {
  await ack();

  let private_metadata = JSON.parse(body.view.private_metadata);
  let options = Object.values(body.view.state.values).map((input) => ({
    time: new Date(
      `${input["select-date"].selected_date}T${input["select-time"].selected_time}`
    ),
  }));

  let created = await prisma.poll.create({
    data: {
      author: body.user.id,
      channel: private_metadata.channel,
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
    channel: private_metadata.channel,
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
});

const modal = (blocks: number): ModalView => {
  let isoToday = new Date().toISOString();
  let date = isoToday.slice(0, 10);
  let time = isoToday.slice(11, 16);

  let dateBlocks = Array.from({ length: blocks }, (x, i) => ({
    type: "actions",
    elements: [
      {
        type: "datepicker",
        initial_date: date,
        placeholder: {
          type: "plain_text",
          text: "Select a date",
          emoji: true,
        },
        action_id: "select-date",
      },
      {
        type: "timepicker",
        initial_time: time,
        placeholder: {
          type: "plain_text",
          text: "Select time",
          emoji: true,
        },
        action_id: "select-time",
      },
    ],
    block_id: `time-input-${i}`,
  }));

  return {
    type: "modal",
    // View identifier
    callback_id: "schedule_view",
    title: {
      type: "plain_text",
      text: "Schemalägg möten!",
    },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Fyll i alternativ nedan!",
        },
      },
      { type: "divider" },
      ...dateBlocks,
      { type: "divider" },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Lägg till alternativ!",
              emoji: true,
            },
            value: `${blocks}`,
            action_id: "add-alt",
          },
        ],
        block_id: "button-block",
      },
    ],
    submit: {
      type: "plain_text",
      text: "Submit",
    },
  };
};

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

(async () => {
  // Start your app
  await app.start();

  console.log("⚡️ Bolt app is running!");
})();
