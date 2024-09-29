## When2Slack

A Slack bot that that can help you do three things:

- Schedule meetings
- Create polls in Slack
- Remind people to react to messages

Kind of like when2meet but for Slack. Useful when deciding on meeting times.

### Usage

- `/schedule` creates a meeting poll, where members can vote on their availability
- `/poll` creates a poll where members can vote on a question

For reactions, you can comment:

`@<when2slack> :relaxed: :thumbsup: remind here`
`@<when2slack> :relaxed: :thumbsup: remind dm`
`@<when2slack> :relaxed: :thumbsup: list`

Inspired by Albin's [slack-reaction-bot](https://github.com/albznw/slack-reaction-bot).

### Installation

To add a running instance of the bot, you can [add it to Slack](https://when2slack.fly.dev/slack/install).

To run your own instance you will need to create a Slack app att [api.slack.com](https://api.slack.com/apps). You can use the provided `slack_app_manifest.yml` to set the correct permissions and features. You will need to change the `when2slack.fly.dev` url to your own.

Deployment is easy with [Fly.io](https://fly.io/). You can deploy the bot with a single command:

```bash
fly deploy -a <app-name>
```

Make sure to store the SQLite database in a persistent volume.
