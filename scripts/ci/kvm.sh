#!/usr/bin/env bash
# The runner's KVM opened for the Android emulator (the emulator action's
# README; native-android.yml's device jobs).
set -euo pipefail
echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' | sudo tee /etc/udev/rules.d/99-kvm4all.rules
sudo udevadm control --reload-rules
sudo udevadm trigger --name-match=kvm
