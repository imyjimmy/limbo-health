#!/bin/sh
envsubst '${CONTAINER_PREFIX}' < /etc/nginx/nginx.conf.template > /tmp/nginx.conf
exec nginx -g 'daemon off;' -c /tmp/nginx.conf