# Worked example

## Contents

- The request
- Reading it
- The reply
- Why this order

## The request

A slide titled "Three wins this quarter" with four bullets in one body element. `chat_inbox {wait: 30}` returns (trimmed):

```json
{
  "layoutRequests": [
    {
      "id": "i3f9a1c2d4e",
      "request": {
        "version": 1,
        "task": "layout-ideas",
        "slide": {
          "id": "s5",
          "layout": "l_content",
          "size": { "w": 960, "h": 540 },
          "elements": [
            { "id": "e11", "type": "shape", "ph": { "type": "title", "idx": 0 }, "text": "Three wins this quarter", "frame": { "x": 60, "y": 40, "w": 840, "h": 70 } },
            { "id": "e12", "type": "shape", "ph": { "type": "body", "idx": 1 }, "text": "Signed 14 new accounts\nOnboarding went from 14 days to 6\nSupport tickets down 22%\nTeam hired two engineers", "frame": { "x": 60, "y": 130, "w": 840, "h": 360 } }
          ]
        },
        "layouts": [
          { "id": "l_content", "name": "Title and Content", "slots": [ { "type": "title", "idx": 0, "frame": { "x": 60, "y": 40, "w": 840, "h": 70 } }, { "type": "body", "idx": 1, "frame": { "x": 60, "y": 130, "w": 840, "h": 360 } } ] },
          { "id": "l_twoContent", "name": "Two Content", "slots": [ { "type": "title", "idx": 0, "frame": { "x": 60, "y": 40, "w": 840, "h": 70 } }, { "type": "body", "idx": 1, "frame": { "x": 60, "y": 130, "w": 410, "h": 360 } }, { "type": "body", "idx": 2, "frame": { "x": 490, "y": 130, "w": 410, "h": 360 } } ] },
          { "id": "l_bigNumber", "name": "Big Number", "slots": [ { "type": "title", "idx": 0, "frame": { "x": 60, "y": 40, "w": 840, "h": 70 } }, { "type": "body", "idx": 1, "frame": { "x": 60, "y": 150, "w": 400, "h": 240 } }, { "type": "body", "idx": 2, "frame": { "x": 500, "y": 150, "w": 400, "h": 300 } } ] },
          { "id": "l_stats", "name": "Statistics", "slots": [ { "type": "title", "idx": 0, "frame": { "x": 60, "y": 40, "w": 840, "h": 70 } }, { "type": "body", "idx": 1, "frame": { "x": 60, "y": 150, "w": 260, "h": 300 } }, { "type": "body", "idx": 2, "frame": { "x": 350, "y": 150, "w": 260, "h": 300 } }, { "type": "body", "idx": 3, "frame": { "x": 640, "y": 150, "w": 260, "h": 300 } } ] }
        ]
      }
    }
  ]
}
```

The real request lists every layout of the master; the example keeps four.

## Reading it

- Content: a claim title and four short, parallel bullets, three of them with a figure (14 accounts, 14 days to 6, 22%, two engineers). One bullet, onboarding from 14 days to 6, is the strongest single figure.
- So the metric layouts lead: Statistics (several short metrics), then Big Number (pull out the onboarding figure), then Two Content (the four bullets split visually across two columns is a fair second reading), then Title and Content as the safe pick.
- Mapping: title element `e11` to the title slot; the body element `e12` to the largest body slot of each layout. In Big Number the largest body slot is idx 2 (300 high), so the body goes there and the person can lift the number into the left slot by hand after applying. No picture, so no picture slots, and every element has a slot, so no `frame`.

## The reply

```
layout_ideas_reply {
  "id": "i3f9a1c2d4e",
  "ideas": [
    {
      "layout": "l_stats",
      "note": "Four short figures read well as separate metrics",
      "place": [
        { "element": "e11", "slot": { "type": "title", "idx": 0 } },
        { "element": "e12", "slot": { "type": "body", "idx": 1 } }
      ]
    },
    {
      "layout": "l_bigNumber",
      "note": "Lift onboarding, 14 days to 6, as the headline",
      "place": [
        { "element": "e11", "slot": { "type": "title", "idx": 0 } },
        { "element": "e12", "slot": { "type": "body", "idx": 2 } }
      ]
    },
    {
      "layout": "l_twoContent",
      "note": "Splits the wins into two readable columns",
      "place": [
        { "element": "e11", "slot": { "type": "title", "idx": 0 } },
        { "element": "e12", "slot": { "type": "body", "idx": 1 } }
      ]
    },
    {
      "layout": "l_content",
      "note": "Plain list, as it is now",
      "place": [
        { "element": "e11", "slot": { "type": "title", "idx": 0 } },
        { "element": "e12", "slot": { "type": "body", "idx": 1 } }
      ]
    }
  ]
}
```

In the Statistics reply the body goes to idx 1, because all three body slots are the same size and the first is the natural start. Every note is under 12 words.

## Why this order

Statistics first because the slide is a set of short metrics; Big Number second because one figure stands out; Two Content third as a layout that works without changing any text; Title and Content last because it always fits and is what the slide already has. Four ideas, within 3 to 8. Then go back to `chat_inbox {wait: 30}`.
