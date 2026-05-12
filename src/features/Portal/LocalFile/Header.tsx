'use client';

import { memo } from 'react';

import PortalHeader from '../components/Header';
import TabStrip from './TabStrip';

const Header = memo(() => <PortalHeader title={<TabStrip />} />);

Header.displayName = 'LocalFileHeader';

export default Header;
