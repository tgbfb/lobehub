import { type FC, type HTMLAttributes } from 'react';

const HubstrText: FC<HTMLAttributes<HTMLSpanElement> & { size?: number }> = ({
  size = 40,
  style,
  ...rest
}) => (
  <span
    style={{
      display: 'inline-block',
      fontSize: size * 0.75,
      fontWeight: 700,
      letterSpacing: '-0.03em',
      lineHeight: 1,
      ...style,
    }}
    {...rest}
  >
    Hubstr
  </span>
);

HubstrText.displayName = 'HubstrText';

export default HubstrText;
