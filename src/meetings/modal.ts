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
import { create_poll, PollType } from "../poll";

let prisma = new PrismaClient();

export async function open_schedule_modal(
  client: WebClient,
  body: SlashCommand,
  logger: Logger
) {
  let meetings = 1;

  try {
    // Call views.open with the built-in client
    let view = {
      ...modal(meetings),
      private_metadata: JSON.stringify({
        meetings: meetings,
        channel: body.channel_id,
      }),
    };
    await client.views.open({
      // Pass a valid trigger_id within 3 seconds of receiving it
      trigger_id: body.trigger_id,
      view: view,
    });
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

// Handles submitting of modal, to create a mew poll
export async function handle_meeting_submit(
  client: WebClient,
  body: SlackViewAction,
  logger: Logger
) {
  let private_metadata = JSON.parse(body.view.private_metadata);
  let options = Object.values(body.view.state.values)
    .filter((input) => input["select-date"])
    .map((input) => ({
      time: new Date(
        `${input["select-date"].selected_date}T${input["select-time"].selected_time}`
      ),
      name: null,
    }));

  let title =
    body.view.state.values["poll-title"]["title"].value || "Schedule meeting";

  let poll = await create_poll(client, {
    type: PollType.Meeting,
    channel: private_metadata.channel,
    user_id: body.user.id,
    options,
    title,
  });

  logger.info(
    `${body.user.id} created poll ${poll.id} in channel ${poll.channel}`
  );
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
      text: "Schedule meetings!",
    },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Please fill in :clock1: times for meetings below, users can select multiple options!",
        },
      },
      {
        type: "input",
        block_id: "poll-title",
        label: {
          type: "plain_text",
          text: "Title of meeting",
        },
        element: {
          type: "plain_text_input",
          action_id: "title",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Timeslots*",
        },
      },
      ...dateBlocks,
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Add timeslot",
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
