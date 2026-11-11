# Luma Photobooth architecture

The first runnable milestone is the custom frame workflow. The application is local-only and requires no account, hosted service, or runtime network connection.

## Process boundaries

- `src/`: React, TypeScript, Tailwind, shadcn-style Radix button component, Lucide, Zustand, and react-konva. Renderer has no Node access.
- `shared/`: validated template schema, print-pixel geometry, sample layouts, and typed bridge contract.
- `electron/preload.ts`: sandbox-compatible, narrow contextBridge API; no arbitrary IPC channel access.
- `electron/main.ts`: sender-validated IPC, native file dialogs, trusted window lifecycle.
- `electron/storage.ts`: SQLite via sql.js, persisted with serialized atomic file replacement. Imported PNG/JPEG assets are orientation-normalized and copied into managed PNG files. Database errors surface instead of silently resetting storage.
- `electron/composition.ts`: Sharp renders a full-resolution SVG scene assembled from validated coordinates and managed images. Crop geometry is shared with Konva. Output embeds DPI metadata. No editor screenshots enter the export path.
- `electron/camera/adapter.ts`: brand-independent asynchronous camera contract. No hardware integration is claimed by this milestone.

## Coordinate and layer contract

Positions, dimensions, borders, font sizes, and radii are output pixels. DPI describes physical print dimensions. Zoom is exclusively a view transform. Rotation is clockwise around each object's top-left point. Layers render in array order, back to front. Hidden layers do not render. Locked layers remain printable but cannot be moved with the canvas or keyboard. Numbered photo slots are explicit user objects; transparent PNG regions are never detected as slots.

Images use shared fit/fill placement with normalized horizontal and vertical crop anchors. Crop masks and borders rotate with the layer. Paper clips off-canvas content. PNG overlays preserve alpha. Changing paper dimensions does not silently rescale existing objects. Duplicate-strip export is enabled only for a 2 × 6 inch document.

Text currently uses single-line Arial. Konva and the SVG rasterizer can differ slightly in font metrics; this milestone's coordinate tests cover photo geometry, not typographic identity. Full typographic parity and font packaging remain production work.

## Persistence

User data: Electron's `userData/studio/studio.sqlite` and `userData/studio/assets/<uuid>.png`. Migration version 1 stores editable JSON and asset metadata. Each write uses a unique temporary file followed by rename. A portable `.luma.json` package embeds original managed assets and editable JSON; importing remaps asset IDs. Assets are retained when deleting a template to avoid breaking other templates; garbage collection is future work. Changes require explicit Save; window-close protection warns about unsaved edits.

## Remaining phases

1. Validate the frame milestone with actual user frame PNGs and photo files.
2. Implement a vendor-specific Windows camera adapter in an isolated helper process. Evaluate licensed Canon EDSDK, Nikon SDK, and Sony Camera Remote SDK independently against the exact camera model. Avoid assuming a shared SDK covers all brands. A development adapter must visibly identify Demo Mode.
3. Add persistent session state and original-photo journaling before any composition; capture mutex, cancellation, download timeout, recovery, retakes, and guest workflow.
4. Add native installed-printer discovery and print jobs, physical paper sizing, queue state, reprints, and hardware tests. OS submission is not proof that paper printed.
5. Add event profiles, settings, kiosk/admin transition, accessibility audit, signed installer, hardware qualification, and recovery/performance testing.

The navigation exposes those future destinations with explicit milestone notices, not fake camera status, sessions, printer queues, or event data.

## Reference documentation

- Electron security and IPC: https://www.electronjs.org/docs/latest/tutorial/security and https://www.electronjs.org/docs/latest/tutorial/ipc
- Sharp composition and metadata: https://sharp.pixelplumbing.com/api-composite/ and https://sharp.pixelplumbing.com/api-output/
