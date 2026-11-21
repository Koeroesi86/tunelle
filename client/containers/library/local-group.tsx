import type { ReactNode } from 'react';
import type { GroupKind } from '@shared/types/library-query';
import type { OpenGroup } from '../../redux/types';
import type { OpenGroupParts } from '../../components/library/group-view/GroupView';
import AlbumSort from './album-sort';
import ArtistPhoto from './artist-photo';
import ArtistPhotoMenu from './artist-photo-menu';
import GroupAlbums from './group-albums';

/** The groups that have a photo, which can be changed */
const photoKinds: GroupKind[] = ['artist', 'albumArtist'];

/** The albums of an open group of the local library, under the bar of the group */
export const renderGroupAlbums = (toolbar: ReactNode): ReactNode => <GroupAlbums toolbar={toolbar} />;

export const localGroupParts = (open: OpenGroup): OpenGroupParts => {
  const hasPhoto = !!open.key && photoKinds.includes(open.kind);

  return {
    photo: hasPhoto && <ArtistPhoto kind={open.kind} photoKey={open.key} />,
    menu: hasPhoto && <ArtistPhotoMenu photoKey={open.key} name={open.name} />,
    sort: <AlbumSort />,
  };
};
