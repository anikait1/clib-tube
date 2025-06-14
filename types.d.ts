declare interface Song {
  id: string;
  title: string;
  subtext: string;
  startTime: number | null;
  endTime: number | null;
}

declare interface CurrentlyPlaying {
  id: string | null;
  title: string | null;
  reset: () => void;
}

declare interface StorageData {
  songs: Array<Song>;
}
