import { applyMiddleware, compose, createStore } from 'redux';
import connectionMiddleware from './connection/middleware';
import uiStateMiddleware from './uiState/middleware';
import outputDevicesMiddleware from './output-devices/middleware';
import reducers from './reducers';

const middlewares = [connectionMiddleware, uiStateMiddleware, outputDevicesMiddleware];

const middlewareEnhancers = applyMiddleware(...middlewares);
const enhancers = compose(middlewareEnhancers);

/** The middleware talks to the main process as soon as it is created, so the store is created when the app has started (client/app.tsx) */
export const createAppStore = () => createStore(reducers, enhancers);
