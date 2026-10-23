# Agent layout ideas

Crafter Ideas normally lists every layout of the slide's master, in master order, each previewed with the slide's content placed the way the Layout gallery places it. formdeck does no classifying, scoring, ranking, filtering or capping.

With Preferences > Plugins > Agent layout ideas on (off by default), Crafter Ideas instead asks the agent the person has connected for placements and shows what it returns. The ordering and the placements are the agent's; formdeck only checks that the ids in the reply exist, then previews and applies them.

Nothing is sent unless the preference is on. If no agent is connected, or none answers in time (25 s for a provider, 90 s for a connected MCP client, 60 s for Claude Code), Crafter Ideas shows every layout in master order and says so.

## How the request reaches the agent

formdeck uses the route the person already set up in the chat panel settings:

- An API provider (Anthropic API, an OpenAI-compatible API, or a local Ollama model): the engine makes one tool-less completion with the person's own key and model, through the same provider classes the chat panel uses.
- Claude Code: one non-interactive run of the person's Claude Code, told not to use tools.
- A connected MCP client (the default "Connected agent" mode): the engine queues the request. A client that is polling `chat_inbox` receives it in `layoutRequests` and answers with the `layout_ideas_reply` tool. The window shows "Agent connected" only while a client is polling.

The window calls `GET /api/chat/ideas/status` (is an agent reachable) and `POST /api/chat/ideas` (the request below, answered with the reply below). Both accept only local origins.

## Request (version 1)

```json
{
  "version": 1,
  "task": "layout-ideas",
  "slide": {
    "id": "s3",
    "layout": "l_content",
    "size": { "w": 960, "h": 540 },
    "elements": [
      { "id": "e67", "type": "shape", "ph": { "type": "title", "idx": 0 }, "text": "Hello", "frame": { "x": 60, "y": 46, "w": 840, "h": 64 } },
      { "id": "e68", "type": "image", "frame": { "x": 100, "y": 150, "w": 300, "h": 200 }, "hidden": true }
    ]
  },
  "layouts": [
    { "id": "l_twoContent", "name": "Two Content", "slots": [ { "type": "title", "idx": 0, "frame": { "x": 60, "y": 40, "w": 840, "h": 70 } } ] }
  ]
}
```

- `slide.elements`: every element of the slide, as stored. `type` is the element type (`shape`, `image`, `table`, `chart`, `group`, `media`), `ph` the placeholder it fills (absent if none), `text` the plain text (up to 2000 characters), `frame` the resolved size and position in points, `hidden` only when true.
- `layouts`: every layout of the slide's master, in master order, with its placeholder slots (`type`, `idx`, resolved `frame`). The slide's current layout is included.

## Reply (version 1)

```json
{
  "version": 1,
  "ideas": [
    {
      "layout": "l_twoContent",
      "note": "optional, at most 12 words",
      "place": [
        { "element": "e67", "slot": { "type": "title", "idx": 0 } },
        { "element": "e68", "frame": { "x": 500, "y": 140, "w": 400, "h": 300 } }
      ]
    }
  ]
}
```

- `ideas`: layouts of the same master, best first (the agent's order is shown as is). A layout id that is not in the request, or repeated, is dropped.
- `place`: where an element goes in that layout. `slot` puts it in the layout's placeholder (the element then takes that placeholder's frame); `frame` gives it explicit points. An element that is not listed, or whose id is unknown, stays as it is. Layout and placements are applied as one undo step.
- A reply that is not this JSON is treated as no answer.

## Switching to plain thumbnails

`CRAFTER_PLAIN_THUMBNAILS` in `frontend/src/editor/design-ideas.ts`, or the hidden setting `crafterPlainThumbnails: true` (no Preferences control), shows each layout's own drawing with none of the slide's content, and places the content only when a layout is applied. It is off.
