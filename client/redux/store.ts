import { applyMiddleware, compose, createStore } from 'redux';
import connectionMiddleware from './connection/middleware';
import uiStateMiddleware from './uiState/middleware';
import outputDevicesMiddleware from './output-devices/middleware';
import reducers from './reducers';

const middlewares = [connectionMiddleware, uiStateMiddleware, outputDevicesMiddleware];

const middlewareEnhancers = applyMiddleware(...middlewares);
const enhancers = compose(middlewareEnhancers);

export const store = createStore(reducers, enhancers);
