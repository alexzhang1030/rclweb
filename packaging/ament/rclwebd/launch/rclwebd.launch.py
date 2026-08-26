"""Start rclwebd as a normal process in a ROS 2 launch graph.

ros2 run already has a sourced prefix, so this does not wrap setup.bash.
Extra ROS launch argv is ignored; configuration stays on the environment
(RCLWEBD_BIND, ROS_DOMAIN_ID, RCLWEBD_OFFER_WEBTRANSPORT, …).
"""

from __future__ import annotations

import os

from ament_index_python.packages import get_package_prefix
from launch import LaunchDescription
from launch.actions import ExecuteProcess


def generate_launch_description() -> LaunchDescription:
    exe = os.path.join(get_package_prefix("rclwebd"), "lib", "rclwebd", "rclwebd")
    return LaunchDescription(
        [
            ExecuteProcess(cmd=[exe], output="screen"),
        ]
    )
