/* eslint-disable no-console */
/* eslint-disable import/no-internal-modules */
import "./utils/env";
import {
  App,
  BlockAction,
  ButtonAction,
  LogLevel,
  OverflowAction,
} from "@slack/bolt";

import { open_schedule_modal, add_meeting, handle_submit } from "./modal";
import { handle_vote, handle_overflow } from "./poll";
import { remind_in_thread } from "./reactions";

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

// -----------------------------
// Scheduling modal
// -----------------------------
app.command("/schedule", async ({ ack, client, body, logger }) => {
  // Handles the /schedule command
  await ack();
  await open_schedule_modal(client, body, logger);
});

app.action<BlockAction>({ action_id: "select-date" }, async ({ ack }) => {
  // Selecting date does nothing
  await ack();
});

app.action<BlockAction>({ action_id: "select-time" }, async ({ ack }) => {
  // Selecting time does nothing
  await ack();
});

app.action<BlockAction>(
  { action_id: "add-alt" },
  async ({ ack, body, client }) => {
    // Add a meeting to the modal
    await ack();
    await add_meeting(client, body);
  }
);

app.view("schedule_view", async ({ ack, body, client, logger }) => {
  // Submitting modal
  await ack();
  await handle_submit(client, body);
});

// -----------------------------
// Voting component
// -----------------------------
app.action<BlockAction<ButtonAction>>(
  "vote_click",
  async ({ ack, body, client, action }) => {
    // Handle when a user votes
    await ack();
    await handle_vote(client, body, action);
  }
);

app.action<BlockAction<OverflowAction>>(
  "form_overflow",
  async ({ ack, body, client, action }) => {
    // Handle when a user deletes a poll
    await ack();
    await handle_overflow(client, body, action);
  }
);

(async () => {
  // Start your app
  await app.start();

  console.log("⚡️ Bolt app is running!");
})();
