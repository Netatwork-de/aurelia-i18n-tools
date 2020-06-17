
# 2.0.0
+ **Breaking Change**: Translation data format changed:
    + File entries moved from the root object to an object named `files`.
    + Deleted translations are pushed to an array named `obsolete`.
    + (v1 translation data files are upgraded automatically when running the development workflow)
