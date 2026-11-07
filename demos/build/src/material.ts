const F = '`'.repeat(3);

export interface Sample { id: string; name: string; hint: string; template: string; text: string }

const PLAN = `---
title: Mill Street Roastery
template: linen
---

<!-- layout: imageFull -->
# Mill Street Roastery
![Two cups of green and roasted coffee on burlap](cups)
A launch plan for a neighbourhood coffee roaster
Notes: Welcome. This is a sample plan with made-up figures, written as plain markdown. Every slide you see is laid out from this text.
Photo: H. Hümâ Yardim, Pexels (Pexels License).

---

# What we will cover
- The idea
- Why this neighbourhood
- How the coffee gets to the cup
- The numbers and the 2027 timeline
- The team and the ask
Notes: Five parts, about twelve minutes.

---

# One roaster, one street, fresh every week
- Buy green coffee direct from three small farms
- Roast in 15 kg batches in the old print shop on Mill Street
- Stamp the roast date on every bag and sell it within ten days
![Red and green coffee cherries on a branch](cherries)
Notes: The pitch in one breath: coffee roasted this week, by people you can walk to.
Photo: Julian Cabrera S, Pexels (Pexels License).

---

# The street is ready for it
- **14,200** residents within a 15 minute walk
- **3** cafes and no roaster in the area
- **62%** of surveyed neighbours would buy beans roasted that week
Notes: Figures come from our 2026 door survey of 310 households (sample data for this demo).

---

> I would walk further for coffee that was roasted this morning.
-- Survey respondent, 2026 pilot
Notes: One comment out of 310, but it came up in different words again and again.

---

# Small batches, honest labels
- Single-origin lots, light to medium roasts
- Roast date and farm on every bag
- A tasting bar for the first Saturday of each month
![Dark roasted coffee beans filling the frame](beans)
Notes: Keep the range short: four coffees, rotating.
Photo: Haberdoedas Photography, Pexels (Pexels License).

---

<!-- layout: process -->
# From farm to bag in four steps
- **Source** Three partner farms, one lot at a time
- **Roast** 15 kg batches, twice a week
- **Rest** Four days in valve bags to settle
- **Deliver** Saturday by bike, or collect on Mill Street
Notes: The rest step is what customers taste as smoothness.

---

# A day at the roaster
![Beans tumbling in the roaster](drum)
![Sacks of green coffee with a tasting bowl](sacks)
![Roasted beans in a tray](roast)
![A cup of black coffee on an oak table](cup)
Notes: Photos: Maria Orlova, Quang Nguyen Vinh, Ahmet Yüksek and Seljan Salimova, Pexels (Pexels License).

---

<!-- layout: bigNumber -->
# Gross margin on whole-bean bags
## 68%
Sold direct through the shop and the web store, before rent and wages.
Notes: Wholesale runs lower, near 45 percent. That is the next slide but one.

---

# Weekly roast volume, first six months
${F}chart
{"kind":"column","categories":["Jan","Feb","Mar","Apr","May","Jun"],"series":[{"name":"kg roasted per week","values":[40,65,95,130,160,190]}]}
${F}
Plan: reach 190 kg a week by June with two roast days.
Notes: Made-up ramp for the demo. The assumption is two new wholesale accounts a month.

---

# Two ways we sell
### Retail and web
- 250 g and 1 kg bags
- Monthly subscription
- Highest margin, lowest volume
### Wholesale
- Cafes and offices within 5 km
- 5 kg orders, delivered weekly
- Lower margin, steady volume
Notes: Retail pays the rent, wholesale keeps the roaster busy.

---

# What a bag earns
| Product | Price | Cost | Margin |
| --- | --- | --- | --- |
| 250 g retail bag | 13.50 | 4.30 | 68% |
| 1 kg retail bag | 44.00 | 15.10 | 66% |
| 5 kg wholesale | 168.00 | 92.40 | 45% |
Notes: Prices in a single currency, made up for the demo.

---

<!-- layout: timeline -->
# 2027 at a glance
- Q1: Lease signed, roaster installed
- Q2: Soft opening and first wholesale account
- Q3: Web shop and subscriptions
- Q4: Second roast day, first hire
Notes: Q1 is the risky one: the roaster has a ten week lead time.

---

<!-- layout: team -->
# The team
- Ana Ruiz, Head roaster
- Marcus Bell, Operations
- Dee Okafor, Wholesale
- Priya Nair, Finance
Notes: Sample names for the demo.

---

# What we are asking for
- **180k** build-out and first stock
- **14 mo** of runway, with a fall-back plan
- **9 mo** to break even at plan volume
Notes: The ask is a loan, not equity.

---

# Risks, and what we do about them
- A bad harvest
  - Contract with three farms, not one
  - Keep a month of green stock
- Roaster delay
  - Order now; rent time on a shared roaster meanwhile
- Wholesale is slow to start
  - Retail covers fixed costs by month four
Notes: We have a plan for each; ask if you want the detail.

---

# Questions
## Thank you
Notes: Pictures in this deck are from Pexels and are credited in the speaker notes of each slide. Figures are fictional and for demonstration only.
`;

const NOTES = `# Mill Street Roastery: launch meeting

Notes from the 14 November planning meeting. Ana, Marcus, Dee and Priya present.

## The idea
We want to roast small batches in the old print shop on Mill Street and sell bags to the neighbourhood and to nearby cafes. Beans come direct from three small farms. Every bag carries its roast date, and we sell it within ten days.

![Beans tumbling in the roaster](drum)

## Why here
14,200 residents live within a 15 minute walk.
3 cafes are in the area and no roaster.
62% of the neighbours we surveyed would buy beans roasted that week.

## How it works
1. Source green coffee from three partner farms
2. Roast in 15 kg batches twice a week
3. Rest the beans for four days
4. Deliver by bike on Saturday, or collect on Mill Street

## What we sell
Retail and web: 250 g and 1 kg bags, a monthly subscription, the highest margin.
Wholesale: cafes and offices within 5 km, 5 kg orders, a steady volume at a lower margin.

![Dark roasted coffee beans](beans)

## Numbers
| Product | Price | Margin |
| --- | --- | --- |
| 250 g retail bag | 13.50 | 68% |
| 1 kg retail bag | 44.00 | 66% |
| 5 kg wholesale | 168.00 | 45% |

## Roadmap
- Q1: lease signed and roaster installed
- Q2: soft opening and the first wholesale account
- Q3: web shop and subscriptions
- Q4: second roast day and a first hire

## Team
- Ana Ruiz, Head roaster
- Marcus Bell, Operations
- Dee Okafor, Wholesale
- Priya Nair, Finance

## Next steps
- Sign the lease by 1 December
- Order the roaster this week, the lead time is ten weeks
- Book the first tasting Saturday
`;

export const SAMPLES: Sample[] = [
  { id: 'plan', name: 'Launch plan (slide script)', hint: 'Markdown with --- between slides', template: 'linen', text: PLAN },
  { id: 'notes', name: 'Meeting notes (raw)', hint: 'Plain notes: press Draft slides', template: 'linen', text: NOTES },
];
