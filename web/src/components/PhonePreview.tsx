import styled from 'styled-components';
import { IconButton, MenuItem, Stack, TextField } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import type { Point } from '@core';

interface PhonePreviewProps {
  points: Point[];
  pointIndex: number;
  onPointChange: (index: number) => void;
  previewName: string;
  previewHtml: string;
}

const PhoneWrap = styled.div`
  display: flex;
  justify-content: center;
  padding: 6px 0 12px;
`;

const Phone = styled.div`
  width: 316px;
  height: 682px;
  background: #0a0c10;
  border-radius: 48px;
  padding: 11px;
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.55), inset 0 0 0 2px #23262c;
  position: relative;
`;

const PhoneCamera = styled.div`
  position: absolute;
  top: 22px;
  left: 50%;
  transform: translateX(-50%);
  width: 16px;
  height: 16px;
  background: #05060a;
  border-radius: 50%;
  border: 2px solid #1b1e25;
  z-index: 3;
`;

const PhoneScreen = styled.div`
  width: 100%;
  height: 100%;
  border-radius: 38px;
  background: #f4f6f9;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: #1b2430;
`;

const StatusBar = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 14px 22px 4px;
  font-size: 11px;
  font-weight: 600;
  background: #f4f6f9;
`;

const TitleBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 14px 8px;
  font-size: 15px;
  font-weight: 600;
`;

const ScreenBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 4px 14px 18px;
`;

const LocusName = styled.div`
  font-size: 19px;
  font-weight: 700;
  color: #0f1822;
  margin: 6px 0 10px;
  line-height: 1.25;
`;

const LocusDescription = styled.div`
  font-size: 13.5px;
  color: #2a3544;
  line-height: 1.5;
  word-wrap: break-word;

  img {
    width: 100%;
    border-radius: 10px;
    margin: 6px 0;
  }
  a {
    color: #0b79d0;
  }
  ul {
    margin: 6px 0;
    padding-left: 20px;
  }
  hr {
    border: none;
    border-top: 1px solid #d7dee6;
    margin: 10px 0;
  }
  b,
  strong,
  font {
    color: #0f1822;
  }
`;

function pointLabel(point: Point, index: number): string {
  const name = point['name'];
  const label = typeof name === 'string' && name ? name : `${String(point['lat'] ?? '')},${String(point['lon'] ?? '')}`;
  return `#${index + 1} — ${label.slice(0, 40)}`;
}

export function PhonePreview(props: PhonePreviewProps): JSX.Element {
  const total = props.points.length;
  const handleStep = (step: number): void => {
    if (total === 0) return;
    props.onPointChange((props.pointIndex + step + total) % total);
  };

  return (
    <div>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <IconButton size="small" disabled={total === 0} onClick={() => handleStep(-1)} aria-label="Предыдущая точка">
          <ChevronLeftIcon fontSize="small" />
        </IconButton>
        <TextField
          select
          size="small"
          fullWidth
          value={total === 0 ? '' : String(props.pointIndex)}
          onChange={(event) => props.onPointChange(Number(event.target.value))}
          disabled={total === 0}
        >
          {total === 0 && <MenuItem value="">—</MenuItem>}
          {props.points.map((point, index) => (
            <MenuItem key={index} value={String(index)}>
              {pointLabel(point, index)}
            </MenuItem>
          ))}
        </TextField>
        <IconButton size="small" disabled={total === 0} onClick={() => handleStep(1)} aria-label="Следующая точка">
          <ChevronRightIcon fontSize="small" />
        </IconButton>
      </Stack>

      <PhoneWrap>
        <Phone>
          <PhoneCamera />
          <PhoneScreen>
            <StatusBar>
              <span>09:41</span>
              <span>5G ▮▮▮ 🔋</span>
            </StatusBar>
            <TitleBar>
              <ChevronLeftIcon fontSize="small" sx={{ color: '#ff7a1a' }} />
              <span>Точка</span>
              <MoreVertIcon fontSize="small" sx={{ color: '#1b2430' }} />
            </TitleBar>
            <ScreenBody>
              <LocusName>{props.previewName || 'Загрузите JSON'}</LocusName>
              <LocusDescription
                dangerouslySetInnerHTML={{
                  __html: props.previewHtml || '<span style="color:#8a97a5">Здесь появится предпросмотр точки.</span>',
                }}
              />
            </ScreenBody>
          </PhoneScreen>
        </Phone>
      </PhoneWrap>
    </div>
  );
}
