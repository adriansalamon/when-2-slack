/* eslint-disable no-console */
/* eslint-disable import/no-internal-modules */
import "./utils/env";
import { App, BlockAction, LogLevel, ModalView, View } from "@slack/bolt";
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

app.action<BlockAction>({ action_id: "select-time" }, async ({ ack }) => {
  await ack();
});

app.view("schedule_view", async ({ ack, body, client, logger }) => {
  await ack();

  let private_metadata = JSON.parse(body.view.private_metadata);
  let options = Object.values(body.view.state.values).map((input) => ({
    time: `${input["select-date"].selected_date} ${input["select-time"].selected_time}`,
  }));

  let created = await prisma.poll.create({
    data: {
      author: body.user.id,
      channel: private_metadata.channel,
      description: "",
      title: "",
      options: {
        create: options,
      },
    },
  });

  let poll = await prisma.poll.findFirstOrThrow({
    where: { id: created.id },
    include: { options: { include: { votes: true } } },
  });

  let form = poll_form(poll);

  client.chat.postMessage({
    channel: private_metadata.channel,
    ...form,
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

type PollData = Poll & { options: (Option & { votes: Vote[] })[] };

const poll_form = (poll: PollData): View => {
  let options = poll.options.flatMap((option) => {
    let votes = option.votes.map((vote) => ({
      type: "image",
      image_url: vote.user,
      alt_text: vote.user,
    }));

    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:calendar: *${option.time}*`,
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            emoji: true,
            text: "Vote",
          },
          value: "vote",
        },
      },
      {
        type: "context",
        elements: [
          ...votes,
          {
            type: "plain_text",
            emoji: true,
            text: `${votes.length} votes`,
          },
        ],
      },
    ];
  });
  return {
    type: "home",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Fill in a date that fits you!",
        },
      },
      { type: "divider" },
      ...options
    ],
  };
};

(async () => {
  // Start your app
  await app.start();

  console.log("⚡️ Bolt app is running!");
})();
