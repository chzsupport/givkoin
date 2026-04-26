export type Achievement = {
  id: string;
  title: string;
  description: string;
  reward: string;
  milestone?: number;
};

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'stars-2',
    title: '2 звезды',
    description: 'Достичь 2 звёзд душевности.',
    reward: '+1,000 K',
    milestone: 2,
  },
  {
    id: 'stars-3',
    title: '3 звезды',
    description: 'Достичь 3 звёзд душевности.',
    reward: '+1,000 K',
    milestone: 3,
  },
  {
    id: 'stars-4',
    title: '4 звезды',
    description: 'Достичь 4 звёзд душевности.',
    reward: '+1,000 K',
    milestone: 4,
  },
  {
    id: 'stars-5',
    title: '5 звёзд',
    description: 'Достичь максимума — 5 звёзд душевности.',
    reward: '+1,000 K + бонус 5,000 K',
    milestone: 5,
  },
];

