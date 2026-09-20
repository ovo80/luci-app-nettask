#!/bin/sh

uid=0

[ -f /etc/crontabs/root ] || touch /etc/crontabs/root

# Only the lines this script owns are removed; the 定时执行 entry maintained by
# /etc/init.d/nettask and anything the user added are left untouched.
sed -i '/#nettask-cron/d' /etc/crontabs/root

while true
do
    b1=$(uci get nettask.@crontab[$uid].shellname)

    if [ -n "$b1" ]; then
        off=$(uci get nettask.@crontab[$uid].type)

        # "default" is the placeholder of the list value, not a real script.
        if [ "$off" = "1" ] && [ "$b1" != "default" ]; then

	    fen_u=$(uci get nettask.@crontab[$uid].minute)
            shi_u=$(uci get nettask.@crontab[$uid].shi)
            ri_u=$(uci get nettask.@crontab[$uid].day)
            yue_u=$(uci get nettask.@crontab[$uid].month)
            zhou_u=$(uci get nettask.@crontab[$uid].week)
            shellname=$(uci get nettask.@crontab[$uid].shellname)

            echo "${fen_u} ${shi_u} ${ri_u} ${yue_u} ${zhou_u} sh /etc/nettask/filetab/$shellname & #nettask-cron" >> /etc/crontabs/root
        fi
    else
        break
    fi

    uid=$((uid + 1))
done

/etc/init.d/cron restart
