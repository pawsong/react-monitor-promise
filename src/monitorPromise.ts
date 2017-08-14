import * as hoistStatics from 'hoist-non-react-statics';
import * as React from 'react';
import { Component, ComponentClass, createElement, StatelessComponent } from 'react';

// tslint:disable-next-line variable-name
function getDisplayName(WrappedComponent: any) {
  return WrappedComponent.displayName || WrappedComponent.name || 'Component';
}

export interface PromiseState<T> {
  promise: Promise<T>;
  pending: boolean;
  fulfilled: boolean;
  rejected: boolean;
  value?: T;
  reason?: any;
}

interface MonitorPromiseState {
  [index: string]: PromiseState<any>;
}

export interface PromiseFactoryMap {
  [index: string]: string;
}

function monitorPromise(promiseFactoryToState: PromiseFactoryMap) {
  const factoryNames = Object.keys(promiseFactoryToState);

  return <P, TComponentConstruct extends (ComponentClass<P> | StatelessComponent<P>)>(
    WrappedComponent: TComponentConstruct,
  ): TComponentConstruct => {
    class MonitorPromise extends Component<any, MonitorPromiseState> {
      unmount: boolean;
      instrumentedFactories: { [index: string]: (...args: any[]) => Promise<any> };

      constructor(props: any) {
        super(props);

        this.unmount = false;
        this.instrumentedFactories = {};

        const state: MonitorPromiseState = {};
        for (const factoryName of factoryNames) {
          const promiseStateName = promiseFactoryToState[factoryName];
          state[promiseStateName] = {
            promise: null,
            pending: false,
            fulfilled: false,
            rejected: false,
          };
        }
        this.state = state;

        this.updateInstrumentedFactories();
      }

      componentWillUnmount() {
        this.unmount = true;
      }

      private shouldPromiseStateUpdate(promise: Promise<any>, promiseStateName: string) {
        return !this.unmount && this.state[promiseStateName].promise === promise;
      }

      private updateInstrumentedFactories() {
        const self = this;

        for (const factoryName of factoryNames) {
          const promiseStateName = promiseFactoryToState[factoryName];
          const factory = this.props[factoryName];

          // tslint:disable-next-line only-arrow-functions
          self.instrumentedFactories[factoryName] = function() {
            const promise: Promise<any> = factory.apply(this, arguments);

            self.setState({
              [promiseStateName]: {
                promise,
                pending: true,
                fulfilled: false,
                rejected: false,
              },
            });

            promise
            .then((value) => {
              if (self.shouldPromiseStateUpdate(promise, promiseStateName)) {
                self.setState({
                  [promiseStateName]: {
                    promise,
                    pending: false,
                    fulfilled: true,
                    rejected: false,
                    value,
                  },
                });
              }
            })
            .catch((reason) => {
              if (self.shouldPromiseStateUpdate(promise, promiseStateName)) {
                self.setState({
                  [promiseStateName]: {
                    promise,
                    pending: false,
                    fulfilled: false,
                    rejected: true,
                    reason,
                  },
                });
              }
            });

            return promise;
          };
        }
      }

      // tslint:disable-next-line member-ordering
      render() {
        return createElement(WrappedComponent as any, {
          ...this.props,
          ...this.state,
          ...this.instrumentedFactories,
        });
      }
    }

    (MonitorPromise as any).WrappedComponent = WrappedComponent;
    (MonitorPromise as any).displayName = `MonitorPromise(${getDisplayName(WrappedComponent)})`;

    return (hoistStatics as any)(MonitorPromise, WrappedComponent);
  };
}

export default monitorPromise;
