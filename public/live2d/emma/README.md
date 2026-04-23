# Emma Live2D Model Files

Place your Live2D Cubism 4 model files here:

```
emma/
├── emma.model3.json          # Entry point (required)
├── emma.moc3                 # Compiled model
├── emma.cdi3.json            # Display info
├── emma.physics3.json        # Hair/clothing physics
├── emma.pose3.json           # Pose switching
├── textures/
│   ├── emma_texture_00.png   # Base texture atlas
│   └── emma_texture_01.png   # Additional textures
├── expressions/
│   ├── neutral.exp3.json
│   ├── smirk.exp3.json
│   ├── warm.exp3.json
│   ├── concerned.exp3.json
│   ├── amused.exp3.json
│   ├── skeptical.exp3.json
│   ├── listening.exp3.json
│   ├── flirty.exp3.json
│   ├── sad.exp3.json
│   └── idle_bored.exp3.json
└── motions/
    ├── Idle/
    ├── Talk/
    ├── React_Positive/
    ├── React_Tease/
    ├── React_Surprise/
    ├── React_Empathy/
    ├── Tap_Head/
    └── Tap_Body/
```

For prototyping, you can use a free Cubism sample model (e.g., Haru or Shizuku)
from https://www.live2d.com/en/learn/sample/ — rename the entry JSON to emma.model3.json.

Without model files, EMMA runs in "placeholder mode" with an animated emoji face
that still reacts to expressions.
