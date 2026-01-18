import { Metadata } from 'next';
import HomeClient from '@/components/HomeClient';

export const metadata: Metadata = {
    other: {
        'base:app_id': '696cba96f22fe462e74c1327',
    },
};

export default function Home() {
    return <HomeClient />;
}
