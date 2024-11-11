import {
  BlockAction,
  BlockElementAction,
  ModalView,
  OverflowAction,
  SlackViewAction,
  SlashCommand,
} from "@slack/bolt";
import { PlainTextOption, WebClient } from "@slack/web-api";
import { Logger } from "@slack/bolt";
import { Poll, PrismaClient, Option } from "@prisma/client";
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
    
    const options = await prisma.option.findMany({
      where: { pollId: poll.id },
    });

    if (options.length > 46) {
      if (body.channel) {
        await client.chat.postEphemeral({
          channel: body.channel?.id,
          user: body.user.id,
          text: "You can't add more than 46 options to a poll, since Slack has a limited message size. Sorry!",
        });
      }
      return;
    }

    // Call views.open with the built-in client
    const result = await client.views.open({
      // Pass a valid trigger_id within 3 seconds of receiving it
      trigger_id: body.trigger_id,
      view: {
        ...option_modal(poll),
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

  let poll = await prisma.poll.findFirstOrThrow({
    where: { ts: metadata.ts, channel: metadata.channel },
  });

  let name = body.view.state.values["option-name"]["name"].value;
  let url = body.view.state.values["option-url"]["url"].value || null;
  let description =
    body.view.state.values["option-description"]["description"].value || null;

  let created = await prisma.option.create({
    data: {
      creator: body.user.id,
      name: name,
      url: url,
      description: description,
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


export async function handle_remove_options_submit(
  client: WebClient,
  body: SlackViewAction,
  logger: Logger
) {
  let metadata = JSON.parse(body.view.private_metadata);

  let poll = await prisma.poll.findFirstOrThrow({
    where: { ts: metadata.ts, channel: metadata.channel },
  });

  let options = body.view.state.values["options"]["options"].selected_options || [];
  let optionIds = options.map((o) => parseInt(o.value));

  await prisma.option.deleteMany({
    where: {
      id: {
        in: optionIds
      }
    }
  })


  let blocks = await poll_blocks(poll.id);

  client.chat.update({
    text: `Vote in poll: ${poll.title}`,
    channel: poll.channel,
    ts: poll.ts,
    blocks: blocks,
  });

  logger.info(
    `User ${body.user.id} removed options ${optionIds} in poll ${poll.id}`
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

export async function open_remove_options_modal(
  client: WebClient,
  body: BlockAction<OverflowAction>,
  logger: Logger
) {
  try {
    let poll = await prisma.poll.findFirstOrThrow({
      where: { ts: body.message?.ts, channel: body.channel?.id },
      include: { options: true },
    });

    // Call views.open with the built-in client
    await client.views.open({
      // Pass a valid trigger_id within 3 seconds of receiving it
      trigger_id: body.trigger_id,
      view: {
        ...remove_options_modal(poll),
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

// Handles submitting of modal, to create a new poll
export async function handle_vote_poll_submit(
  client: WebClient,
  body: SlackViewAction,
  logger: Logger
) {
  let private_metadata = JSON.parse(body.view.private_metadata);
  let options = [];

  let title = body.view.state.values["poll-title"]["title"].value || "Poll";
  let description =
    body.view.state.values["poll-description"]["description"].value || null;
  let addOptionDesc =
    body.view.state.values["poll-add-option-description"][
      "add-option-description"
    ].value || null;
  let displayVotes =
    body.view.state.values["poll-display-votes"]["display"].selected_option
      ?.value;
  let open = body.view.state.values["poll-open"]["open"].selected_option?.value;

  let poll = await create_poll(client, {
    type: PollType.Vote,
    channel: private_metadata.channel,
    user_id: body.user.id,
    options,
    title,
    displayVotes: displayVotes === "true",
    usersCanAddOption: open === "true",
    description,
    addOptionDesc,
  });

  logger.info(
    `${body.user.id} created poll ${poll.id} in channel ${poll.channel}`
  );
}

const option_modal = (poll: Poll): ModalView => {
  let desc =
    "Add an option to the poll, if you want to use an :sunglasses: emoji, add it as `:<emoji name>:`";
  if (poll.addOptionDesc) {
    desc += `\n${poll.addOptionDesc}`;
  }

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
          text: desc,
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
      {
        type: "input",
        block_id: "option-description",
        label: {
          type: "plain_text",
          text: "Description",
        },
        element: {
          type: "plain_text_input",
          action_id: "description",
        },
        optional: true,
      },
      {
        type: "input",
        block_id: "option-url",
        label: {
          type: "plain_text",
          text: "Link to the option",
        },
        element: {
          type: "plain_text_input",
          action_id: "url",
        },
        optional: true,
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
          text: "Please fill in :white_check_mark: the following fields to create a poll. Users can add options to the poll after it's created",
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
        block_id: "poll-description",
        label: {
          type: "plain_text",
          text: "Poll description",
        },
        element: {
          type: "plain_text_input",
          action_id: "description",
          multiline: true,
        },
        optional: true,
      },
      {
        type: "input",
        block_id: "poll-add-option-description",
        label: {
          type: "plain_text",
          text: "Description when adding options",
        },
        element: {
          type: "plain_text_input",
          action_id: "add-option-description",
          multiline: true,
        },
        optional: true,
      },
      {
        type: "input",
        block_id: "poll-display-votes",
        label: {
          type: "plain_text",
          text: "Display user votes?",
        },
        element: {
          type: "static_select",
          action_id: "display",
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

const remove_options_modal = (
  poll: Poll & { options: Option[] }
): ModalView => {
  let options: PlainTextOption[] = poll.options.map((option) => ({
    text: {
      type: "plain_text",
      text: `${option.name}`,
      emoji: true,
    },
    value: `${option.id}`,
  }));

  return {
    type: "modal",
    // View identifier
    callback_id: "remove_options_poll_view",
    title: {
      type: "plain_text",
      text: "Remove poll options",
    },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Please select the options you want to remove from the poll. Note that this action is irreversible :warning:",
        },
      },
      {
        type: "input",
        block_id: "options",
        label: {
          type: "plain_text",
          text: "Options",
        },
        element: {
          type: "multi_static_select",
          action_id: "options",
          placeholder: {
            type: "plain_text",
            text: "Select vote options",
          },
          options: options,
        },
      },
    ],
    submit: {
      type: "plain_text",
      text: "Submit",
    },
  };
};
