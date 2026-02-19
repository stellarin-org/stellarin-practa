# Grounding Thumbs

A relaxation exercise using multitouch. Place both thumbs on the circles, hold and squeeze, then slowly release to let tension melt away.

## Installation

This Practa component is designed for the Stellarin app.

## Usage

```tsx
import GroundingThumbs from "@stellarin/practa-grounding-thumbs";

function MyFlow() {
  return (
    <GroundingThumbs
      context={{ flowId: "my-flow", practaIndex: 0 }}
      onComplete={(output) => console.log("Completed:", output)}
    />
  );
}
```

## Props

This component accepts the standard Practa props:

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `context` | PractaContext | Yes | Flow context from previous Practa |
| `onComplete` | (output: PractaOutput) => void | Yes | Callback when the Practa completes |

## Author

Created by Mike Messenger

## Version

2.6.1
