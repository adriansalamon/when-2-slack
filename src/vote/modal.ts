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
import { create_poll, poll_blocks, PollType } from "../poll";

let prisma = new PrismaClient();

export async function open_add_option_modal(
  client: WebClient,
  body: BlockAction<BlockElementAction>,
  logger: Logger
) {
  try {
    const poll = await prisma.poll.findFirstOrThrow({
      where: { ts: body.message?.ts, channel: body.channel?.id },
    });

    if (poll.usersCanAddOption === false && poll.author !== body.user.id) {
      if (body.channel) {
        await client.chat.postEphemeral({
          channel: body.channel?.id,
          user: body.user.id,
          text: "Only the author of the poll can add options",
        });
      }
      return;
    }

    // Call views.open with the built-in client
    const result = await client.views.open({
      // Pass a valid trigger_id within 3 seconds of receiving it
      trigger_id: body.trigger_id,
      view: {
        ...option_modal(),
        private_metadata: JSON.stringify({
          ts: body.message?.ts,
          channel: body.channel?.id,
        }),
      },
    });
  } catch (error) {
    logger.error(error);
  }
}

export async function handle_add_option_submit(
  client: WebClient,
  body: SlackViewAction,
  logger: Logger
) {
  let metadata = JSON.parse(body.view.private_metadata);

  let option = body.view.state.values["option-name"]["name"].value;
  let poll = await prisma.poll.findFirstOrThrow({
    where: { ts: metadata.ts, channel: metadata.channel },
  });

  let created = await prisma.option.create({
    data: {
      name: option,
      pollId: poll.id,
    },
  });

  let blocks = await poll_blocks(poll.id);
  client.chat.update({
    text: `Vote in poll: ${poll.title}`,
    channel: poll.channel,
    ts: poll.ts,
    blocks: blocks,
  });

  logger.info(
    `User ${body.user.id} created option ${created.id} in poll ${poll.id}`
  );
}

export async function open_vote_modal(
  client: WebClient,
  body: SlashCommand,
  logger: Logger
) {
  try {
    // Call views.open with the built-in client
    const result = await client.views.open({
      // Pass a valid trigger_id within 3 seconds of receiving it
      trigger_id: body.trigger_id,
      view: {
        ...modal(),
        private_metadata: JSON.stringify({
          channel: body.channel_id,
        }),
      },
    });
  } catch (error) {
    logger.error(error);
  }
}

// Handles submitting of modal, to create a mew poll
export async function handle_vote_poll_submit(
  client: WebClient,
  body: SlackViewAction,
  logger: Logger
) {
  let private_metadata = JSON.parse(body.view.private_metadata);
  let options = [];

  let title = body.view.state.values["poll-title"]["title"].value || "Poll";
  let open = body.view.state.values["poll-open"]["open"].selected_option?.value;

  let poll = await create_poll(client, {
    type: PollType.Vote,
    channel: private_metadata.channel,
    user_id: body.user.id,
    options,
    title,
    usersCanAddOption: open === "true",
  });

  logger.info(
    `${body.user.id} created poll ${poll.id} in channel ${poll.channel}`
  );
}

const option_modal = (): ModalView => {
  return {
    type: "modal",
    // View identifier
    callback_id: "poll_add_option_view",
    title: {
      type: "plain_text",
      text: "Add option!",
    },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Add an option to the poll, if you want to use an :sunglasses: emoji, add it as `:<emoji name>:`",
        },
      },
      {
        type: "input",
        block_id: "option-name",
        label: {
          type: "plain_text",
          text: "Name of the option",
        },
        element: {
          type: "plain_text_input",
          action_id: "name",
        },
      },
    ],
    submit: {
      type: "plain_text",
      text: "Submit",
    },
  };
};

const modal = (): ModalView => {
  return {
    type: "modal",
    // View identifier
    callback_id: "vote_poll_view",
    title: {
      type: "plain_text",
      text: "Create poll!",
    },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Please fill in :white_check_mark: the following fields to create a poll. Users can add options to the poll after it's created.",
        },
      },
      {
        type: "input",
        block_id: "poll-title",
        label: {
          type: "plain_text",
          text: "Poll title",
        },
        element: {
          type: "plain_text_input",
          action_id: "title",
        },
      },
      {
        type: "input",
        block_id: "poll-open",
        label: {
          type: "plain_text",
          text: "Allow anyone to add options?",
        },
        element: {
          type: "static_select",
          action_id: "open",
          options: [
            {
              text: {
                type: "plain_text",
                text: "Yes",
              },
              value: "true",
            },
            {
              text: {
                type: "plain_text",
                text: "No",
              },
              value: "false",
            },
          ],
        },
      },
    ],
    submit: {
      type: "plain_text",
      text: "Submit",
    },
  };
};
