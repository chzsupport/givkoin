export type CreateEntityStep = 'gallery' | 'confirm' | 'name';

export type EntityResponse = {
    entity?: {
        _id?: string;
        id?: string | number;
        name: string;
        avatarUrl: string;
        mood: string;
        createdAt: string;
        satietyUntil?: string | null;
        history?: { message: string; createdAt: string }[];
    };
};

export type EntityCreateTranslate = (key: string) => string;
