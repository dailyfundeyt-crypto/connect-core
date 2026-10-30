import React from "react";

/**
 * Lazy-loaded lane route components for Swarm-v2.
 * Allows independent development of frontend views without coupling.
 */
export const Lane01 = React.lazy(() => import("./-lane-01"));
export const Lane02 = React.lazy(() => import("./-lane-02"));
export const Lane03 = React.lazy(() => import("./-lane-03"));
export const Lane04 = React.lazy(() => import("./-lane-04"));
export const Lane05 = React.lazy(() => import("./-lane-05"));
export const Lane06 = React.lazy(() => import("./-lane-06"));
export const Lane07 = React.lazy(() => import("./-lane-07"));
export const Lane08 = React.lazy(() => import("./-lane-08"));
export const Lane09 = React.lazy(() => import("./-lane-09"));
export const Lane10 = React.lazy(() => import("./-lane-10"));

export const laneRouteLoaders = {
  Lane01,
  Lane02,
  Lane03,
  Lane04,
  Lane05,
  Lane06,
  Lane07,
  Lane08,
  Lane09,
  Lane10,
};

export default laneRouteLoaders;
