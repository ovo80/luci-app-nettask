include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-nettask
PKG_VERSION:=2.1.0
PKG_RELEASE:=1

PKG_MAINTAINER:=ovo80 <lkl80@outlook.com>
PKG_URL:=https://github.com/ovo80/luci-app-nettask

# po2lmo comes from luci-base's host build.
PKG_BUILD_DEPENDS:=luci-base/host

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-nettask
	SECTION:=luci
	CATEGORY:=LuCI
	SUBMENU:=3. Applications
	TITLE:=Run custom shell scripts from the web interface
	PKGARCH:=all
	DEPENDS:=+luci-base
endef

define Package/luci-app-nettask/description
	Edit and schedule shell scripts from the web interface: run them on demand,
	at boot, on a physical button press, on network loss or on a cron schedule.
endef

define Package/luci-app-nettask/conffiles
/etc/config/nettask
/etc/nettask/duan.sh
/etc/nettask/word.sh
/etc/nettask/button.sh
/etc/nettask/network.sh
/etc/nettask/timing.sh
endef

# menu.d and acl.d are only picked up after the rpcd and menu caches are
# refreshed, which is what luci.mk's default postinst would do for us.
define Package/luci-app-nettask/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	rm -f /tmp/luci-indexcache.*
	rm -rf /tmp/luci-modulecache/
	/etc/init.d/rpcd reload 2>/dev/null
}
exit 0
endef

# The button handler swaps /etc/rc.button/reset aside, so removing the package
# has to put it back and stop whatever is still running.
define Package/luci-app-nettask/postrm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	if [ -f /etc/rc.button/reset_bak ]; then
		mv -f /etc/rc.button/reset_bak /etc/rc.button/reset
	elif [ -L /etc/rc.button/reset ]; then
		rm -f /etc/rc.button/reset
	fi
	pgrep -f /etc/nettask/ | xargs kill -9 >/dev/null 2>&1
	sed -i '/nettask-cron/d' /etc/crontabs/root 2>/dev/null
	rm -f /tmp/luci-indexcache.*
	rm -rf /tmp/luci-modulecache/
	/etc/init.d/rpcd reload 2>/dev/null
}
exit 0
endef

define Build/Prepare
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/luci-app-nettask/install
	$(INSTALL_DIR) $(1)/usr/libexec
	$(INSTALL_BIN) ./root/usr/libexec/nettask-action $(1)/usr/libexec/nettask-action

	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/nettask
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/nettask/*.js $(1)/www/luci-static/resources/view/nettask/

	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/luci-app-nettask.json $(1)/usr/share/luci/menu.d/

	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-nettask.json $(1)/usr/share/rpcd/acl.d/

	# The strings in the sources are Chinese, so the English catalog has to be
	# compiled here: luci.mk skips po/en because English is upstream's source
	# language, and the dispatcher loads every *.<lang>.lmo it finds.
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/i18n
	po2lmo $(CURDIR)/po/en/nettask.po $(1)/usr/lib/lua/luci/i18n/nettask.en.lmo

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./root/etc/config/nettask $(1)/etc/config/nettask

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./root/etc/init.d/nettask $(1)/etc/init.d/nettask

	$(INSTALL_DIR) $(1)/etc/nettask/filetab
	$(INSTALL_DATA) ./root/etc/nettask/* $(1)/etc/nettask/
	chmod 0755 $(1)/etc/nettask/*

	$(INSTALL_DIR) $(1)/lib/upgrade/keep.d
	$(INSTALL_DATA) ./root/lib/upgrade/keep.d/luci-app-nettask $(1)/lib/upgrade/keep.d/luci-app-nettask
endef

$(eval $(call BuildPackage,luci-app-nettask))
