import { type FC, type SVGAttributes } from 'react';

const HubstrText: FC<SVGAttributes<SVGSVGElement> & { size?: number }> = ({
  size = '1em',
  style,
  ...rest
}) => (
  <svg
    fill="currentColor"
    height={size}
    style={{ flex: 'none', lineHeight: 1, ...style }}
    viewBox="0 0 940 320"
    xmlns="http://www.w3.org/2000/svg"
    {...rest}
  >
    <title>Hubstr</title>
    <text
      dominantBaseline="auto"
      fontFamily="-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',system-ui,sans-serif"
      fontSize="262"
      fontWeight="700"
      letterSpacing="-6"
      textAnchor="middle"
      x="470"
      y="264"
    >
      Hubstr
    </text>
  </svg>
);

HubstrText.displayName = 'HubstrText';

export default HubstrText;
