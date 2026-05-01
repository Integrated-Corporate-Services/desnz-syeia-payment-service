FROM node:18-alpine

RUN apk add --no-cache zip aws-cli python3

COPY ./localstack-init/register-lambdas.entrypoint /register-lambdas.sh
RUN chmod +x /register-lambdas.sh

ENTRYPOINT ["/register-lambdas.sh"]
