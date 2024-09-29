import { Poll, PrismaClient, Option, Vote } from "@prisma/client";

function option_block(option: Option & { votes: Vote[] }) {
  let names = option.votes.reduce(
    (acc, vote) => `${acc} @${vote.userName}`,
    ""
  );

  let time = option.time || new Date();

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
}

export function meeting_blocks(
  poll: Poll & { options: (Option & { votes: Vote[] })[] }
) {
  let options = poll.options.flatMap(option_block);

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Meeting times for *${poll.title}*. Select all :clock1: timeslots that work! *React* with :no_entry_sign: if no times work!`,
      },
      accessory: {
        type: "overflow",
        action_id: "form_overflow",
        options: [
          { text: { type: "plain_text", text: "Delete" }, value: "delete" },
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
  ];
}
