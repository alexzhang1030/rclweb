cmake_minimum_required(VERSION 3.16)
project(rclwebd)

find_package(ament_cmake REQUIRED)

set(_repo_root "${CMAKE_CURRENT_SOURCE_DIR}/../../..")
set(_rclwebd_bin "")
if(DEFINED ENV{RCLWEBD_BIN} AND EXISTS "$ENV{RCLWEBD_BIN}")
  set(_rclwebd_bin "$ENV{RCLWEBD_BIN}")
elseif(EXISTS "${_repo_root}/target/release/rclwebd")
  set(_rclwebd_bin "${_repo_root}/target/release/rclwebd")
elseif(EXISTS "${_repo_root}/target/debug/rclwebd")
  set(_rclwebd_bin "${_repo_root}/target/debug/rclwebd")
else()
  find_program(_rclwebd_on_path rclwebd)
  if(_rclwebd_on_path)
    set(_rclwebd_bin "${_rclwebd_on_path}")
  endif()
endif()

if(_rclwebd_bin)
  message(STATUS "Installing rclwebd from ${_rclwebd_bin}")
  install(PROGRAMS "${_rclwebd_bin}" DESTINATION "lib/${PROJECT_NAME}" RENAME rclwebd)
else()
  message(WARNING
    "rclwebd binary not found; installing a PATH wrapper. "
    "Set RCLWEBD_BIN or build target/release/rclwebd first.")
  install(PROGRAMS rclwebd-from-path.sh DESTINATION "lib/${PROJECT_NAME}" RENAME rclwebd)
endif()

install(DIRECTORY launch DESTINATION "share/${PROJECT_NAME}")

ament_package()
