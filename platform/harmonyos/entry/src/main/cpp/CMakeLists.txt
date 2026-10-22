cmake_minimum_required(VERSION 3.16)
project(ohpaseo_nodeprobe)

set(CMAKE_CXX_STANDARD 17)
set(NATP_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../../libs/arm64-v8a)

add_library(entry SHARED
    napi_init.cpp
    node_probe.cpp)

target_include_directories(entry PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(entry PUBLIC libace_napi.z.so libhilog_ndk.z.so dl)

# Bundle vendored shared libs (must live under entry/libs/arm64-v8a)
# hvigor's default packaging picks up entry/libs/<abi>/*.so automatically.
