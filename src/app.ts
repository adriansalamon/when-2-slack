/* eslint-disable no-console */
/* eslint-disable import/no-internal-modules */
import "./utils/env";
import { App, BlockAction, ButtonAction, OverflowAction } from "@slack/bolt";

import {
  open_schedule_modal,
  add_meeting,
  handle_meeting_submit,
} from "./meetings/modal";
import {
  handle_add_option_submit,
  handle_vote_poll_submit,
  open_add_option_modal,
} from "./vote/modal";
import { handle_vote, handle_overflow } from "./poll";
import { PrismaClient } from "@prisma/client";
import { PrismaInstallationStore } from "slack-bolt-prisma";
import { ConsoleLogger, LogLevel } from "@slack/logger";
import { open_vote_modal } from "./vote/modal";
import { ensure_channel_member, handle_mention } from "./reactions";

let logLevel = LogLevel.DEBUG;
if (process.env.NODE_ENV === "production") {
  logLevel = LogLevel.INFO;
}

let prisma = new PrismaClient();
const logger = new ConsoleLogger();
logger.setLevel(logLevel);

const installationStore = new PrismaInstallationStore({
  prismaTable: prisma.slackAppInstallation,
  clientId: process.env.SLACK_CLIENT_ID,
  logger,
});

const scopes = [
  "commands",
  "channels:read",
  "channels:history",
  "groups:history",
  "groups:read",
  "reactions:write",
  "im:history",
  "chat:write",
  "reactions:read",
  "users:read",
  "mpim:history",
  "app_mentions:read",
];

let app: App;

if (process.env.NODE_ENV === "production") {
  app = new App({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
    stateSecret: process.env.SLACK_STATE_SECRET,
    scopes,
    installerOptions: {
      directInstall: true,
    },
    installationStore,
    logger,
    logLevel,
    port: Number(process.env.PORT) || 3000,
  });
} else {
  app = new App({
    scopes,
    logger,
    logLevel,
    port: Number(process.env.PORT) || 3000,
    socketMode: true,
    token: process.env.SLACK_BOT_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN,
  });
}

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
  let member: boolean = await ensure_channel_member(client, body);
  if (member) {
    await handle_meeting_submit(client, body, logger);
  }
});

// -----------------------------
// Vote creation modal
// -----------------------------

app.command("/poll", async ({ ack, client, body, logger }) => {
  // Handles the /poll command
  await ack();
  await open_vote_modal(client, body, logger);
});

app.view("vote_poll_view", async ({ ack, body, client, logger }) => {
  // Submitting modal
  await ack();

  let member: boolean = await ensure_channel_member(client, body);
  if (member) {
    await handle_vote_poll_submit(client, body, logger);
  }
});

// -----------------------------
// Poll component
// -----------------------------
app.action<BlockAction<ButtonAction>>(
  "vote_click",
  async ({ ack, body, client, action, logger }) => {
    // Handle when a user votes
    await ack();
    await handle_vote(client, body, action, logger);
  }
);

app.action<BlockAction<OverflowAction>>(
  "form_overflow",
  async ({ ack, body, client, action, logger }) => {
    // Handle when a user deletes a poll
    await ack();
    await handle_overflow(client, body, action, logger);
  }
);

app.action<BlockAction<ButtonAction>>(
  "add-option",
  async ({ ack, body, client, logger }) => {
    // Handle when a user wants to add an option
    await ack();
    await open_add_option_modal(client, body, logger);
  }
);

// -----------------------------
// Add option modal
// -----------------------------
app.view("poll_add_option_view", async ({ ack, client, body, logger }) => {
  // Add option to poll
  await ack();
  await handle_add_option_submit(client, body, logger);
});

// -----------------------------
// Mentions
// -----------------------------
app.event("app_mention", async ({ client, event, logger }) => {
  console.log("Handling mention");
  await handle_mention(client, event, logger);
});

(async () => {
  // Start your app
  await app.start();

  console.log("⚡️ Bolt app is running!");
})();
