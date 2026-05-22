import ManagedSettings
import ManagedSettingsUI
import UIKit

/// ロックされたアプリを開いたときに表示されるシールド画面のカスタマイズ。
final class ShieldConfigurationExtension: ShieldConfigurationDataSource {
    private func smartWalkShield() -> ShieldConfiguration {
        ShieldConfiguration(
            backgroundBlurStyle: .systemMaterialDark,
            backgroundColor: nil,
            icon: UIImage(systemName: "figure.walk"),
            title: ShieldConfiguration.Label(
                text: "外に出よう", color: .white),
            subtitle: ShieldConfiguration.Label(
                text: "解除スポットに着くとロックが外れます", color: .lightGray),
            primaryButtonLabel: ShieldConfiguration.Label(
                text: "目的地を確認", color: .black),
            primaryButtonBackgroundColor: .white
        )
    }

    override func configuration(shielding application: Application) -> ShieldConfiguration {
        smartWalkShield()
    }

    override func configuration(shielding application: Application,
                                in category: ActivityCategory) -> ShieldConfiguration {
        smartWalkShield()
    }

    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
        smartWalkShield()
    }

    override func configuration(shielding webDomain: WebDomain,
                                in category: ActivityCategory) -> ShieldConfiguration {
        smartWalkShield()
    }
}
