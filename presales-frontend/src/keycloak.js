import Keycloak from "keycloak-js";

export const kc = new Keycloak({
  url: "http://localhost:8080",
  realm: "presales",
  clientId: "presales-app",
});
