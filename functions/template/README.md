# template

Starting point for a new destination function. Copy it with:

```sh
npm run new:function -- yourFunction
```

## What it does

`onTrack` returns the event, enriched with the Engage traits named in
`settings.traitsToReturn` when that setting is populated. When it is empty the
Profile API is not called at all.

## Settings

| Setting           | Required       | Purpose                                         |
| ----------------- | -------------- | ----------------------------------------------- |
| `engageSpaceId`   | when enriching | Engage space queried for traits                 |
| `profileApiToken` | when enriching | Profile API access token                        |
| `traitsToReturn`  | no             | trait names to fetch; empty disables enrichment |

## Deploy targets

`function.json` holds this function's Segment function ID per environment. Fill in
all three before the first deploy — a blank ID for the environment being deployed
fails the deploy with a clear message rather than writing to the wrong function.
