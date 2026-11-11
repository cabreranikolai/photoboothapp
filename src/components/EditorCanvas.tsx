import { useEffect, useRef, useState } from 'react';
import {
  Stage,
  Layer as CanvasLayer,
  Rect,
  Group,
  Image,
  Text,
  Transformer,
  Line,
} from 'react-konva';
import Konva from 'konva';
import type { Layer, Asset } from '../../shared/model';
import { imagePlacement } from '../../shared/geometry';
import { useStudio } from '../store';
function useImage(asset?: Asset) {
  const [image, setImage] = useState<HTMLImageElement>();
  useEffect(() => {
    setImage(undefined);
    if (!asset) return;
    const img = new window.Image();
    img.onload = () => setImage(img);
    img.src = asset.dataUrl;
    return () => {
      img.onload = null;
    };
  }, [asset]);
  return image;
}
function ObjectNode({
  object: l,
  asset,
  snap,
  preview,
  onGuide,
}: {
  object: Layer;
  asset?: Asset;
  snap: boolean;
  preview: boolean;
  onGuide: (axis: 'x' | 'y' | null) => void;
}) {
  const image = useImage(asset),
    s = useStudio();
  const selected = s.selected.includes(l.id),
    radius = Math.min(l.radius, l.width / 2, l.height / 2);
  const p = image ? imagePlacement(image.width, image.height, l) : null;
  return (
    <Group
      id={l.id}
      x={l.x}
      y={l.y}
      rotation={l.rotation}
      visible={l.visible}
      draggable={!l.locked && !preview}
      onClick={(e) => {
        if (preview) return;
        e.cancelBubble = true;
        s.select(
          e.evt.shiftKey
            ? selected
              ? s.selected.filter((id) => id !== l.id)
              : [...s.selected, l.id]
            : [l.id],
        );
      }}
      onTap={() => s.select([l.id])}
      onDragMove={(e) => {
        if (!snap) return;
        const node = e.target;
        let x = Math.round(node.x() / 10) * 10,
          y = Math.round(node.y() / 10) * 10;
        let axis: 'x' | 'y' | null = null;
        if (Math.abs(x + l.width / 2 - s.template.width / 2) < 20) {
          x = (s.template.width - l.width) / 2;
          axis = 'x';
        }
        if (Math.abs(y + l.height / 2 - s.template.height / 2) < 20) {
          y = (s.template.height - l.height) / 2;
          axis = 'y';
        }
        node.position({ x, y });
        onGuide(axis);
      }}
      onDragEnd={(e) => {
        s.update(l.id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) });
        onGuide(null);
      }}
      onTransformEnd={(e) => {
        const node = e.target;
        s.update(l.id, {
          x: Math.round(node.x()),
          y: Math.round(node.y()),
          width: Math.max(1, Math.round(l.width * node.scaleX())),
          height: Math.max(1, Math.round(l.height * node.scaleY())),
          rotation: Math.round(node.rotation()),
        });
        node.scale({ x: 1, y: 1 });
      }}
    >
      <Group
        clipFunc={(ctx) => {
          ctx.beginPath();
          ctx.roundRect(0, 0, l.width, l.height, radius);
          ctx.closePath();
        }}
      >
        {l.type === 'text' ? (
          <Text
            text={l.text}
            width={l.width}
            height={l.height}
            fontSize={l.fontSize}
            fontFamily="Arial"
            fill={l.color}
            wrap="none"
          />
        ) : image && p ? (
          <Image image={image} {...p} />
        ) : (
          <>
            <Rect width={l.width} height={l.height} fill={preview ? '#d8ded8' : '#dbe3dc'} />
            <Text
              text={`0${l.capture}`}
              width={l.width}
              y={l.height / 2 - 38}
              align="center"
              fontSize={58}
              fontFamily="Arial"
              fill="#96a79b"
            />
            <Text
              text="PHOTO PLACEHOLDER"
              width={l.width}
              y={l.height / 2 + 35}
              align="center"
              fontSize={Math.min(19, l.width / 18)}
              letterSpacing={2}
              fill="#738b7b"
            />
          </>
        )}
      </Group>
      {l.border > 0 && (
        <Rect
          x={l.border / 2}
          y={l.border / 2}
          width={Math.max(0, l.width - l.border)}
          height={Math.max(0, l.height - l.border)}
          cornerRadius={radius}
          stroke={l.color}
          strokeWidth={l.border}
          listening={false}
        />
      )}
      {!preview && selected && (
        <Rect
          width={l.width}
          height={l.height}
          stroke="#45bb8c"
          strokeWidth={3}
          listening={false}
        />
      )}
    </Group>
  );
}
export function EditorCanvas({
  zoom,
  grid,
  snap,
  preview,
}: {
  zoom: number;
  grid: boolean;
  snap: boolean;
  preview: boolean;
}) {
  const s = useStudio(),
    stage = useRef<Konva.Stage>(null),
    transformer = useRef<Konva.Transformer>(null),
    host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 700, height: 700 }),
    [guide, setGuide] = useState<'x' | 'y' | null>(null);
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    transformer.current?.nodes(
      s.selected
        .map((id) => stage.current?.findOne(`#${id}`))
        .filter(
          (n): n is Konva.Node => !!n && !s.template.layers.find((l) => l.id === n.id())?.locked,
        ),
    );
  }, [s.selected, s.template, preview]);
  const scale =
    Math.min((size.width - 110) / s.template.width, (size.height - 100) / s.template.height) * zoom;
  const x = (size.width - s.template.width * scale) / 2,
    y = (size.height - s.template.height * scale) / 2;
  return (
    <div className="canvas-host" ref={host}>
      <Stage
        ref={stage}
        width={size.width}
        height={size.height}
        onMouseDown={(e) => {
          if (e.target === e.target.getStage() || e.target.name() === 'paper') s.select([]);
        }}
      >
        <CanvasLayer>
          <Group x={x} y={y} scaleX={scale} scaleY={scale}>
            <Rect
              name="paper"
              width={s.template.width}
              height={s.template.height}
              fill={s.template.background}
              shadowColor="#000000"
              shadowBlur={55}
              shadowOpacity={0.25}
            />
            <Group clipX={0} clipY={0} clipWidth={s.template.width} clipHeight={s.template.height}>
              {s.template.layers.map((l) => (
                <ObjectNode
                  key={l.id}
                  object={l}
                  asset={l.assetId ? s.assets[l.assetId] : undefined}
                  snap={snap}
                  preview={preview}
                  onGuide={setGuide}
                />
              ))}
              {grid &&
                !preview &&
                Array.from({ length: Math.ceil(s.template.width / 100) }, (_, i) => (
                  <Line
                    key={`v${i}`}
                    points={[i * 100, 0, i * 100, s.template.height]}
                    stroke="#487a6940"
                    strokeWidth={1 / scale}
                    listening={false}
                  />
                ))}
              {grid &&
                !preview &&
                Array.from({ length: Math.ceil(s.template.height / 100) }, (_, i) => (
                  <Line
                    key={`h${i}`}
                    points={[0, i * 100, s.template.width, i * 100]}
                    stroke="#487a6940"
                    strokeWidth={1 / scale}
                    listening={false}
                  />
                ))}
            </Group>
            {guide && (
              <Line
                points={
                  guide === 'x'
                    ? [s.template.width / 2, 0, s.template.width / 2, s.template.height]
                    : [0, s.template.height / 2, s.template.width, s.template.height / 2]
                }
                stroke="#f477bb"
                strokeWidth={1 / scale}
                listening={false}
              />
            )}
            {!preview && (
              <Transformer
                ref={transformer}
                flipEnabled={false}
                keepRatio={
                  s.template.layers.find((l) => l.id === s.selected[0])?.aspectLocked ?? false
                }
                borderStroke="#45bb8c"
                anchorStroke="#45bb8c"
                anchorFill="#ffffff"
                anchorSize={8}
                rotateAnchorOffset={25}
                boundBoxFunc={(old, next) =>
                  Math.abs(next.width) < 8 || Math.abs(next.height) < 8 ? old : next
                }
              />
            )}
          </Group>
          {!preview &&
            Array.from({ length: Math.floor(s.template.width / 300) + 1 }, (_, i) => (
              <Text
                key={i}
                x={x + i * 300 * scale - 8}
                y={y - 24}
                text={String(i * 300)}
                fontSize={10}
                fill="#7e8984"
              />
            ))}
          {!preview &&
            Array.from({ length: Math.floor(s.template.height / 300) + 1 }, (_, i) => (
              <Text
                key={i}
                x={x - 38}
                y={y + i * 300 * scale - 5}
                text={String(i * 300)}
                fontSize={10}
                fill="#7e8984"
              />
            ))}
        </CanvasLayer>
      </Stage>
    </div>
  );
}
