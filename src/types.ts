/**
 * TODO - Try to define a better type here such that, it is easy to distinguish between two scenarios of
 * song being played and not being played
 */
export type CurrentlyPlaying = {
  id: string | null;
  title: string | null;

  reset: () => void;
  data: () => { id: string | null; title: string | null };
};

export type Song = {
  id: string;
  title: string;
  startTime: number | null;
  endTime: number | null;
};

export type SavedSongsMap = Map<Song["id"], Omit<Song, "id">>;

export type StorageData = {
  songs: Song[];
};

export type MessageResponse =
  | { success: false; error: string }
  | { success: true; data: ReturnType<CurrentlyPlaying["data"]> }
  | undefined;
