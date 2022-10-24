/* eslint-disable no-console */
/* eslint-disable import/no-internal-modules */
import "./utils/env";
import { App, BlockAction, LogLevel, ModalView } from "@slack/bolt";
import { type } from "os";

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

  try {
    // Call views.open with the built-in client
    const result = await client.views.open({
      // Pass a valid trigger_id within 3 seconds of receiving it
      trigger_id: body.trigger_id,
      view: modal(1)
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

    let times = parseInt(body.view?.private_metadata || "0") + 1;

    await client.views.update({
      view_id: body.view?.id,
      view: modal(times),
    });
  }
);

app.action<BlockAction>({ action_id: "select-date" }, async ({ ack }) => {
  await ack();
});

app.action<BlockAction>({ action_id: "select-time" }, async ({ ack }) => {
  await ack();
});

app.view("schedule_view", async ({ ack, body, client, logger}) => {
  await ack();
})

const modal = (blocks: number): ModalView => {
  let isoToday = new Date().toISOString()
  let date = isoToday.slice(0, 10)
  let time = isoToday.slice(11, 16)

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
      }
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
    private_metadata: `${blocks}`,
  };
};

(async () => {
  // Start your app
  await app.start();

  console.log("⚡️ Bolt app is running!");
})();
