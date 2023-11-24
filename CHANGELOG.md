
# 4.0
+ **Breaking Change**: Drop gulp support.
+ **Breaking Change**: Drop support for nodejs 15 or lower.

# 3.0
+ **Breaking Change**: Update parse5 to version 6.

# 2.2
+ Add configurable whitespace handling.

# 2.1
+ Empty translations are not added to the _obsolete_ translations array.
+ Add fallback tag names.

# 2.0
+ **Breaking Change**: Translation data format changed:
    + File entries moved from the root object to an object named `files`.
    + Deleted translations are pushed to an array named `obsolete`.
    + (v1 translation data files are upgraded automatically when running the development workflow)
