import { Poll, PrismaClient, Option, Vote } from "@prisma/client";

function option_block(poll : Poll, option: Option & { votes: Vote[] }) {
  let names = option.votes.reduce(
    (acc, vote) => `${acc} @${vote.userName}`,
    ""
  );

  let name = option.name || "No name";
  
  let text = "";

  if (option.url) {
    text = `*<${option.url}|${option.name}>*`;
  } else {
    text = `*${name}*`;
  }

  if (option.creator) {
    text += ` | <@${option.creator}>`;
  }


  if (option.votes.length > 0) {
    text += ` ${"`"}${option.votes.length}${"`"}`;
  }
  if (option.description) {
    text += `\n${option.description}`;
  }

  if (poll.displayUsersVotes && names) {
    text += `\n${names}`;
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
}

export function vote_blocks(
  poll: Poll & { options: (Option & { votes: Vote[] })[] }
) {
  let options = poll.options
    .sort((a, b) => b.votes.length - a.votes.length)
    .flatMap((option) => option_block(poll, option))

  let text = `:ballot_box_with_ballot: *${poll.title}* by <@${poll.author}>`;

  if (poll.description) {
    text += `\n${poll.description}`;
  }

  text += `\nVote for all options! React with :no_entry_sign: if you don't want to vote.`

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: text
      },
      accessory: {
        type: "overflow",
        action_id: "form_overflow",
        options: [
          { text: { type: "plain_text", text: "Delete" }, value: "delete" },
          {
            text: { type: "plain_text", text: "Remove options" },
            value: "remove-options",
          },
          {
            text: { type: "plain_text", text: "Remind in dm" },
            value: "remind-dm",
          },
          {
            text: { type: "plain_text", text: "List users not responded" },
            value: "list-non-responded",
          },
        ],
      },
    },
    { type: "divider" },
    ...options,
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Add option",
            emoji: true,
          },
          action_id: "add-option",
        },
      ],
    },
  ];
}
