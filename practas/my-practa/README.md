# Pressure Grounding

A relaxation exercise using multitouch. Place both thumbs on the circles, hold and squeeze, then slowly release to let tension melt away.

## Installation

This Practa component is designed for the Stellarin app.

## Usage

```tsx
import PressureGrounding from "@stellarin/practa-my-practa";

function MyFlow() {
  return (
    <PressureGrounding
      context={{ flowId: "my-flow", practaIndex: 0 }}
      onComplete={(output) => console.log("Completed:", output)}
      onSkip={() => console.log("Skipped")}
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
| `onSkip` | () => void | No | Optional callback to skip the Practa |

## Author

Created by Your Name

## Version

2.3.0
