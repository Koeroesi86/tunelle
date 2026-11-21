# Containers

`client/containers/` holds the components that are connected to the Redux store (`connect`, `mapState`, `mapDispatch`) and to the audio context. `client/components/` holds the views they render, which take props and callbacks only, so a view is tested and reused without a store.

- A container mirrors the folder of its view: `components/pages/home/HomeView.tsx` is wrapped by `containers/pages/home/index.tsx`, and the other files that import the page import the container.
- The test of a container (`index.test.tsx`, with a store from `createStore`) lives beside it; the test of the view stays in `components/`.
- Every connected component is in `containers/`. `components/` does not import `react-redux` (lint, `no-restricted-imports`, tests excepted); types and pure helpers of `redux/` (`getCachedItem`, `browseKey`) may be imported there.
- A new connected component is a view in `components/` and a container beside the same path in `containers/`.
- A view of the local library can be given another source: the parts that are specific to the local library are props (`openAlbum`, `playAlbum`, `fetchAll`, optional `selected` and `folders`) which the local containers fill (`containers/library/local-album.ts`). The containers `source-albums`, `source-artists` and `source-tracks` give the same views the page caches of a server in `state.sources.lists`, from a `SourceBrowse` request (see [sources.md](../app/sources.md)).
