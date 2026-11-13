#!/bin/sh
# Builds the test database from the migrations alone, then fails if the
# result differs from prisma/schema.prisma (schema <-> migrations drift).
#
# Uses TEST_DATABASE_URL only, never DATABASE_URL, and refuses a database
# whose name lacks "test": migrate deploy changes the database it runs on.
set -eu

: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to a disposable database (see tests/db/helpers.ts)}"

db_name=${TEST_DATABASE_URL##*/}
db_name=${db_name%%\?*}
case "$db_name" in
  *test*) ;;
  *)
    echo "Refusing to migrate \"$db_name\": the database name must contain \"test\"." >&2
    exit 1
    ;;
esac

export DATABASE_URL="$TEST_DATABASE_URL"
yarn prisma migrate deploy
yarn prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --exit-code
echo "Migrations reproduce prisma/schema.prisma exactly."
