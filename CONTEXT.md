# Domain Context

Project-specific terms are resolved here so catalog, site, CLI, and DSH plugin behavior use the
same language.

| Term                     | Meaning                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| Catalog entry            | One source-backed record generated from a pinned package or public bundle repository.                 |
| Public marketplace entry | A catalog entry of type `plugin` or `bundle` shown on dsh.pub; seams and libraries are excluded.      |
| Capability topic         | One of eight stable, user-facing groupings mapped from source-declared catalog categories.            |
| Directory snapshot       | The compact, checked-in projection of all public marketplace entries bundled with the DSH plugin.     |
| Included                 | Shipped as part of the pinned Harness source/profile; it is not an independent install claim.         |
| Git installable          | A public repository and package path with a validated `dsh.bundle.patch` contract.                    |
| CLI-reported install     | A completed install reported by `dshpub`; not a unique user, clone, download, or active installation. |
