import {
  BlockAction,
  BlockElementAction,
  ModalView,
  SlackViewAction,
  SlashCommand,
} from "@slack/bolt";
import { WebClient } from "@slack/web-api";
import { Logger } from "@slack/bolt";
import { PrismaClient } from "@prisma/client";
import { create_poll } from "./poll";

let prisma = new PrismaClient();

export async function open_schedule_modal(
  client: WebClient,
  body: SlashCommand,
  logger: Logger
) {
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
}

export async function add_meeting(
  client: WebClient,
  body: BlockAction<BlockElementAction>
) {
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

export async function handle_submit(client: WebClient, body: SlackViewAction) {
  let private_metadata = JSON.parse(body.view.private_metadata);
  let options = Object.values(body.view.state.values).map((input) => ({
    time: new Date(
      `${input["select-date"].selected_date}T${input["select-time"].selected_time}`
    ),
  }));

  await create_poll(client, private_metadata.channel, body.user.id, options);
}

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
